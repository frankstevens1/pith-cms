import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';

import {
  ConfigurationError,
  ContentAlreadyExistsError,
  ContentPathError,
  RepositoryConflictError,
  RepositoryNotFoundError,
} from '@pith-cms/core';
import { describe, expect, it } from 'vitest';

import {
  GitHubRateLimitError,
  createGitHubRepository,
  type GitHubTransport,
  type GitHubTransportRequest,
} from '../src/index.js';

describe('@pith-cms/storage-github direct publishing', () => {
  it('reads, lists, creates, updates, conflicts, and deletes opaque UTF-8 content', async () => {
    const api = new MockGitHubApi({
      main: {
        'content/pages/home.json': '{\n  "title": "Home"\n}\n',
        'content/pages/你好.json': '{"title":"你好"}\n',
      },
    });
    const repository = createRepository(api);

    const home = await repository.read('content/pages/home.json');
    expect(home?.content).toContain('Home');
    expect(home?.revision).toMatch(/^github-sha:[0-9a-f]{40}$/);
    await expect(repository.read('content/pages/missing.json')).resolves.toBeNull();

    const listed = await repository.list('content/pages');
    expect(listed.map((file) => file.path)).toEqual([
      'content/pages/home.json',
      'content/pages/你好.json',
    ]);
    expect(listed[0]?.revision).toBe(home?.revision);

    const created = await repository.write({
      path: 'content/pages/about.json',
      content: '{"title":"About"}\n',
      createOnly: true,
      message: 'Create page: about',
    });
    expect(created.publication).toMatchObject({
      provider: 'github',
      mode: 'direct',
      branch: 'main',
    });
    expect(api.lastCommitMessage).toBe('Create page: about');

    const updated = await repository.write({
      path: 'content/pages/about.json',
      content: '{"title":"Updated"}\n',
      expectedRevision: created.revision,
      message: 'Update page: about',
    });
    expect(updated.revision).not.toBe(created.revision);
    await expect(
      repository.write({
        path: 'content/pages/about.json',
        content: '{"title":"Stale"}\n',
        expectedRevision: created.revision,
        message: 'Update page: about',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await expect(
      repository.write({
        path: 'content/pages/about.json',
        content: '{}',
        createOnly: true,
        message: 'Create page: about',
      }),
    ).rejects.toBeInstanceOf(ContentAlreadyExistsError);

    await expect(
      repository.delete({
        path: 'content/pages/about.json',
        expectedRevision: created.revision,
        message: 'Delete page: about',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const deleted = await repository.delete({
      path: 'content/pages/about.json',
      expectedRevision: updated.revision,
      message: 'Delete page: about',
    });
    expect(deleted.publication?.commitSha).toMatch(/^[0-9a-f]{40}$/);
    await expect(repository.read('content/pages/about.json')).resolves.toBeNull();
    await expect(
      repository.delete({
        path: 'content/pages/about.json',
        expectedRevision: updated.revision,
        message: 'Delete page: about',
      }),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('rejects unsafe paths and rate-limit errors without leaking provider response bodies', async () => {
    const api = new MockGitHubApi({ main: {} });
    const repository = createRepository(api);

    await expect(repository.read('../secret')).rejects.toBeInstanceOf(ContentPathError);

    api.rateLimitNextRequest = true;
    try {
      await repository.read('content/pages/home.json');
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubRateLimitError);
      expect(String(error)).not.toContain('token-that-must-not-leak');
    }
  });
});

describe('@pith-cms/storage-github pull-request publishing', () => {
  it('creates an isolated branch and pull request while keeping the base branch unchanged', async () => {
    const api = new MockGitHubApi({ main: { 'content/posts/post.md': 'Before\n' } });
    const repository = createRepository(api, {
      mode: 'pull-request',
      branchPrefix: 'pith/',
      baseBranch: 'main',
    });
    const initial = await repository.read('content/posts/post.md');

    if (!initial) {
      throw new Error('Expected the base fixture to exist.');
    }

    const result = await repository.write({
      path: 'content/posts/post.md',
      content: 'After\n',
      expectedRevision: initial.revision,
      message: 'Update posts: post',
    });

    expect(result.publication).toMatchObject({
      provider: 'github',
      mode: 'pull-request',
      reviewNumber: 42,
      reviewUrl: 'https://github.test/acme/site/pull/42',
    });
    expect(result.publication?.branch).toMatch(/^pith\/update\/content-posts-post\.md-/);
    expect(api.content('main', 'content/posts/post.md')).toBe('Before\n');
    expect(api.content(result.publication?.branch ?? '', 'content/posts/post.md')).toBe('After\n');
    expect(api.pullRequests[0]).toMatchObject({ base: 'main', title: 'Update posts: post' });
    expect(api.pullRequests[0]?.body).toContain('Collection: posts');
  });
});

describe('@pith-cms/storage-github preview capabilities', () => {
  it('reads a trusted ref without changing canonical reads and resolves review state safely', async () => {
    const api = new MockGitHubApi({
      main: { 'content/posts/post.md': 'Base\n' },
      'pith/review': { 'content/posts/post.md': 'Preview\n' },
    });
    const repository = createRepository(api);

    const preview = await repository.readAtRef('content/posts/post.md', 'pith/review');
    const canonical = await repository.read('content/posts/post.md');
    const listed = await repository.listAtRef('content/posts', 'pith/review');

    expect(preview?.content).toBe('Preview\n');
    expect(canonical?.content).toBe('Base\n');
    expect(listed.map((file) => file.path)).toEqual(['content/posts/post.md']);
    await expect(repository.readAtRef('content/posts/post.md', '../main')).rejects.toBeInstanceOf(
      ContentPathError,
    );

    await expect(
      repository.getPublicationStatus({
        provider: 'github',
        mode: 'pull-request',
        branch: 'pith/review',
        reviewNumber: 42,
      }),
    ).resolves.toEqual({ state: 'review-open' });

    api.pullRequestState = 'merged';
    await expect(
      repository.getPublicationStatus({
        provider: 'github',
        mode: 'pull-request',
        reviewNumber: 42,
      }),
    ).resolves.toMatchObject({ state: 'review-merged' });
    await expect(
      repository.getPublicationStatus({ provider: 'github', mode: 'direct' }),
    ).resolves.toEqual({ state: 'committed' });
  });
});

describe('@pith-cms/storage-github authentication', () => {
  it('uses token authentication and reuses a GitHub App installation token before expiry', async () => {
    const tokenApi = new MockGitHubApi({ main: {} });
    const tokenRepository = createRepository(tokenApi);
    await tokenRepository.verifyConnection();
    expect(tokenApi.authorizationHeaders).toContain('Bearer test-token');

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const appApi = new MockGitHubApi({ main: {} });
    const appRepository = createGitHubRepository({
      owner: 'acme',
      repository: 'site',
      branch: 'main',
      auth: {
        app: {
          appId: '123',
          installationId: '456',
          privateKey: privateKey
            .export({ format: 'pem', type: 'pkcs8' })
            .toString()
            .replaceAll('\n', '\\n'),
        },
      },
      apiBaseUrl: 'https://github.test',
      transport: appApi.transport,
    });

    await appRepository.read('content/pages/missing.json');
    await appRepository.read('content/pages/missing-again.json');
    expect(appApi.installationTokenRequests).toBe(1);
    expect(appApi.authorizationHeaders.some((value) => value.startsWith('Bearer ey'))).toBe(true);
    expect(
      appApi.authorizationHeaders.filter((value) => value === 'Bearer installation-token'),
    ).toHaveLength(4);
  });
});

describe('@pith-cms/storage-github configuration', () => {
  it('rejects incomplete credentials and unsafe publishing configuration before network access', () => {
    expect(() =>
      createGitHubRepository({
        owner: '',
        repository: 'site',
        branch: 'main',
        auth: { token: 'token' },
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createGitHubRepository({
        owner: 'acme',
        repository: 'site',
        branch: 'main',
        auth: { token: '' },
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createGitHubRepository({
        owner: 'acme',
        repository: 'site',
        branch: 'main',
        auth: { app: { appId: '1', installationId: '2', privateKey: 'not-a-key' } },
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createGitHubRepository({
        owner: 'acme',
        repository: 'site',
        branch: 'main',
        auth: { token: 'token' },
        publishing: { mode: 'pull-request', branchPrefix: '../pith' },
      }),
    ).toThrow(ConfigurationError);
  });
});

function createRepository(
  api: MockGitHubApi,
  publishing:
    | { readonly mode: 'direct' }
    | {
        readonly mode: 'pull-request';
        readonly branchPrefix: string;
        readonly baseBranch: string;
      } = { mode: 'direct' },
) {
  return createGitHubRepository({
    owner: 'acme',
    repository: 'site',
    branch: 'main',
    auth: { token: 'test-token' },
    publishing,
    apiBaseUrl: 'https://github.test',
    transport: api.transport,
  });
}

class MockGitHubApi {
  readonly branches = new Map<string, Map<string, string>>();
  readonly pullRequests: Array<Record<string, unknown>> = [];
  readonly authorizationHeaders: string[] = [];
  lastCommitMessage: string | undefined;
  installationTokenRequests = 0;
  rateLimitNextRequest = false;
  pullRequestState: 'open' | 'merged' | 'closed' = 'open';
  private revision = 0;

  constructor(initial: Record<string, Record<string, string>>) {
    for (const [branch, files] of Object.entries(initial)) {
      this.branches.set(branch, new Map(Object.entries(files)));
    }
  }

  readonly transport: GitHubTransport = async (request) => this.handle(request);

  content(branch: string, path: string): string | undefined {
    return this.branches.get(branch)?.get(path);
  }

  private async handle(request: GitHubTransportRequest): Promise<Response> {
    this.authorizationHeaders.push(request.headers.authorization ?? '');

    if (this.rateLimitNextRequest) {
      this.rateLimitNextRequest = false;
      return response(429, { message: 'token-that-must-not-leak' }, { 'retry-after': '10' });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/app/installations/456/access_tokens' && request.method === 'POST') {
      this.installationTokenRequests += 1;
      return response(201, {
        token: 'installation-token',
        expires_at: '2099-01-01T00:00:00.000Z',
      });
    }

    if (pathname === '/repos/acme/site' && request.method === 'GET') {
      return response(200, { full_name: 'acme/site' });
    }

    if (pathname === '/user' && request.method === 'GET') {
      return response(200, { login: 'pith-app' });
    }

    const ref = /^\/repos\/acme\/site\/git\/ref\/heads\/(.+)$/.exec(pathname);

    if (ref && request.method === 'GET') {
      const branch = decodeURIComponent(ref[1] ?? '');
      return this.branches.has(branch)
        ? response(200, { object: { sha: this.headSha(branch) } })
        : response(404, { message: 'Not Found' });
    }

    if (pathname === '/repos/acme/site/git/refs' && request.method === 'POST') {
      const body = jsonBody(request);
      const branch = typeof body.ref === 'string' ? body.ref.replace('refs/heads/', '') : '';
      const base = typeof body.sha === 'string' ? this.findBranchByHead(body.sha) : undefined;

      if (!branch || !base || this.branches.has(branch)) {
        return response(422, { message: 'Reference already exists' });
      }

      this.branches.set(branch, new Map(this.branches.get(base)));
      return response(201, { ref: `refs/heads/${branch}` });
    }

    if (pathname === '/repos/acme/site/pulls' && request.method === 'POST') {
      const body = jsonBody(request);
      this.pullRequests.push(body);
      return response(201, { number: 42, html_url: 'https://github.test/acme/site/pull/42' });
    }

    if (pathname === '/repos/acme/site/pulls/42' && request.method === 'GET') {
      return response(200, {
        state: this.pullRequestState === 'open' ? 'open' : 'closed',
        merged: this.pullRequestState === 'merged',
        ...(this.pullRequestState === 'merged' ? { merged_at: '2026-07-21T12:00:00.000Z' } : {}),
        ...(this.pullRequestState === 'closed' ? { closed_at: '2026-07-21T12:00:00.000Z' } : {}),
      });
    }

    const commit = /^\/repos\/acme\/site\/commits\/(.+)$/.exec(pathname);
    if (commit && request.method === 'GET') {
      const ref = decodeURIComponent(commit[1] ?? '');
      return this.branches.has(ref)
        ? response(200, { sha: this.headSha(ref) })
        : response(404, { message: 'Not Found' });
    }

    const content = /^\/repos\/acme\/site\/contents\/(.+)$/.exec(pathname);

    if (!content) {
      return response(404, { message: 'Not Found' });
    }

    const path = decodePath(content[1] ?? '');
    const branch = url.searchParams.get('ref') ?? jsonBranch(request) ?? 'main';
    const files = this.branches.get(branch);

    if (!files) {
      return response(404, { message: 'Not Found' });
    }

    if (request.method === 'GET') {
      const file = files.get(path);

      if (file !== undefined) {
        return response(200, fileResponse(path, file, this.shaFor(file)));
      }

      const directory = path.endsWith('/') ? path : `${path}/`;
      const entries = [...files.entries()]
        .filter(([candidate]) => candidate.startsWith(directory))
        .map(([candidate, value]) => candidate.slice(directory.length))
        .filter((candidate) => !candidate.includes('/'))
        .map((name) => {
          const fullPath = `${directory}${name}`;
          const value = files.get(fullPath) ?? '';
          return { type: 'file', path: fullPath, sha: this.shaFor(value) };
        });
      return entries.length > 0 ? response(200, entries) : response(404, { message: 'Not Found' });
    }

    const body = jsonBody(request);
    const current = files.get(path);
    this.lastCommitMessage = typeof body.message === 'string' ? body.message : undefined;

    if (request.method === 'PUT') {
      const expectedSha = typeof body.sha === 'string' ? body.sha : undefined;

      if (
        (current !== undefined && expectedSha !== this.shaFor(current)) ||
        (current === undefined && expectedSha)
      ) {
        return response(422, { message: 'sha does not match' });
      }

      if (current !== undefined && expectedSha === undefined) {
        return response(422, { message: "sha wasn't supplied" });
      }

      const value =
        typeof body.content === 'string'
          ? Buffer.from(body.content, 'base64').toString('utf8')
          : '';
      files.set(path, value);
      const commit = this.nextSha(`commit:${path}:${value}`);
      return response(200, {
        content: { sha: this.shaFor(value) },
        commit: { sha: commit, html_url: `https://github.test/acme/site/commit/${commit}` },
      });
    }

    if (request.method === 'DELETE') {
      const expectedSha = typeof body.sha === 'string' ? body.sha : undefined;

      if (current === undefined) {
        return response(404, { message: 'Not Found' });
      }

      if (expectedSha !== this.shaFor(current)) {
        return response(409, { message: 'sha does not match' });
      }

      files.delete(path);
      const commit = this.nextSha(`delete:${path}`);
      return response(200, {
        commit: { sha: commit, html_url: `https://github.test/acme/site/commit/${commit}` },
      });
    }

    return response(405, { message: 'Method Not Allowed' });
  }

  private shaFor(value: string): string {
    return Buffer.from(value).toString('hex').padEnd(40, '0').slice(0, 40);
  }

  private nextSha(value: string): string {
    this.revision += 1;
    return Buffer.from(`${this.revision}:${value}`).toString('hex').padEnd(40, 'a').slice(0, 40);
  }

  private findBranchByHead(sha: string): string | undefined {
    return [...this.branches.keys()].find((branch) => this.headSha(branch) === sha);
  }

  private headSha(branch: string): string {
    return Buffer.from(`head:${branch}`).toString('hex').padEnd(40, 'b').slice(0, 40);
  }
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function jsonBody(request: GitHubTransportRequest): Record<string, unknown> {
  return request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
}

function jsonBranch(request: GitHubTransportRequest): string | undefined {
  const branch = jsonBody(request).branch;
  return typeof branch === 'string' ? branch : undefined;
}

function decodePath(path: string): string {
  return path.split('/').map(decodeURIComponent).join('/');
}

function fileResponse(path: string, value: string, sha: string): Record<string, unknown> {
  return {
    type: 'file',
    path,
    sha,
    size: Buffer.byteLength(value, 'utf8'),
    encoding: 'base64',
    content: Buffer.from(value, 'utf8').toString('base64'),
  };
}
