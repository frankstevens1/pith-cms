import { Buffer } from 'node:buffer';

import {
  ContentPathError,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from '@pith-cms/core';
import { repositoryContractTests } from '../../../tests/repository-contract.js';
import { createGitHubRepository } from '../src/index.js';
import type { GitHubTransport, GitHubTransportRequest } from '../src/index.js';

repositoryContractTests({
  name: 'github (mocked Contents API)',
  errors: {
    ContentPathError,
    RepositoryConflictError,
    RepositoryError,
    RepositoryNotFoundError,
  },
  async createRepository() {
    const api = new ContractGitHubApi();

    return {
      repository: createGitHubRepository({
        owner: 'acme',
        repository: 'site',
        branch: 'main',
        auth: { token: 'test-token' },
        apiBaseUrl: 'https://github.test',
        transport: api.transport,
      }),
      async cleanup() {
        // The transport is isolated in memory for every test.
      },
    };
  },
});

class ContractGitHubApi {
  private readonly files = new Map<string, string>();
  private revision = 0;

  readonly transport: GitHubTransport = async (request) => this.handle(request);

  private async handle(request: GitHubTransportRequest): Promise<Response> {
    const url = new URL(request.url);
    const contentMatch = /^\/repos\/acme\/site\/contents\/(.+)$/.exec(url.pathname);

    if (url.pathname === '/repos/acme/site/git/ref/heads/main' && request.method === 'GET') {
      return response(200, { object: { sha: sha('head') } });
    }

    if (url.pathname === '/repos/acme/site' && request.method === 'GET') {
      return response(200, { full_name: 'acme/site' });
    }

    if (!contentMatch) {
      return response(404, { message: 'Not Found' });
    }

    const path = contentMatch[1]?.split('/').map(decodeURIComponent).join('/') ?? '';

    if (request.method === 'GET') {
      const content = this.files.get(path);

      if (content !== undefined) {
        return response(200, file(path, content));
      }

      const prefix = `${path}/`;
      const listed = [...this.files.entries()]
        .filter(([candidate]) => candidate.startsWith(prefix))
        .map(([candidate, value]) => candidate.slice(prefix.length))
        .filter((name) => !name.includes('/'))
        .map((name) => {
          const childPath = `${prefix}${name}`;
          return { type: 'file', path: childPath, sha: sha(this.files.get(childPath) ?? '') };
        });
      return listed.length > 0 ? response(200, listed) : response(404, { message: 'Not Found' });
    }

    const body = request.body ? (JSON.parse(request.body) as Record<string, unknown>) : {};
    const current = this.files.get(path);

    if (request.method === 'PUT') {
      const suppliedSha = typeof body.sha === 'string' ? body.sha : undefined;

      if (
        (current !== undefined && suppliedSha !== sha(current)) ||
        (current === undefined && suppliedSha !== undefined) ||
        (current !== undefined && suppliedSha === undefined)
      ) {
        return response(422, { message: 'sha mismatch' });
      }

      const content =
        typeof body.content === 'string'
          ? Buffer.from(body.content, 'base64').toString('utf8')
          : '';
      this.files.set(path, content);
      return response(200, {
        content: { sha: sha(content) },
        commit: { sha: this.nextCommit(), html_url: 'https://github.test/commit/test' },
      });
    }

    if (request.method === 'DELETE') {
      const suppliedSha = typeof body.sha === 'string' ? body.sha : undefined;

      if (current === undefined) {
        return response(404, { message: 'Not Found' });
      }

      if (suppliedSha !== sha(current)) {
        return response(409, { message: 'sha mismatch' });
      }

      this.files.delete(path);
      return response(200, {
        commit: { sha: this.nextCommit(), html_url: 'https://github.test/commit/test' },
      });
    }

    return response(405, { message: 'Method Not Allowed' });
  }

  private nextCommit(): string {
    this.revision += 1;
    return sha(`commit-${this.revision}`);
  }
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function file(path: string, content: string): Record<string, unknown> {
  return {
    type: 'file',
    path,
    sha: sha(content),
    size: Buffer.byteLength(content),
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
  };
}

function sha(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(40, '0').slice(0, 40);
}
