import { Buffer } from 'node:buffer';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { version as pkgVersion } from '../package.json';

import {
  ConfigurationError,
  ContentAlreadyExistsError,
  ContentPathError,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
  normalizeContentPath,
} from '@pith-cms/core';
import type {
  RepositoryFile,
  RepositoryFileSummary,
  RepositoryPublicationReference,
  RepositoryPublicationStatus,
  WriteFileInput,
} from '@pith-cms/core';

import {
  GitHubApiError,
  GitHubAuthenticationError,
  GitHubAuthorizationError,
  GitHubBranchNotFoundError,
  GitHubBranchProtectionError,
  GitHubPullRequestError,
  GitHubRateLimitError,
  GitHubRepositoryNotFoundError,
} from './errors.js';
import type {
  GitHubAuthOptions,
  GitHubConnectionResult,
  GitHubContentRepository,
  GitHubDeleteFileResult,
  GitHubPublishingOptions,
  GitHubPublishingResult,
  GitHubRepositoryOptions,
  GitHubTransport,
  GitHubTransportRequest,
  GitHubWriteFileResult,
} from './types.js';

const GITHUB_API_VERSION = '2022-11-28';
const MAX_TEXT_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_COMMIT_MESSAGE_LENGTH = 256;
const INSTALLATION_TOKEN_REFRESH_WINDOW_SECONDS = 60;

interface ResolvedOptions {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly auth: ResolvedAuth;
  readonly publishing: ResolvedPublishing;
  readonly apiBaseUrl: string;
  readonly commitAuthor?: { readonly name: string; readonly email: string };
  readonly transport: GitHubTransport;
}

type ResolvedAuth =
  | { readonly type: 'token'; readonly token: string }
  | {
      readonly type: 'app';
      readonly appId: string;
      readonly installationId: string;
      readonly privateKey: KeyObject;
    };

type ResolvedPublishing =
  | { readonly mode: 'direct' }
  | {
      readonly mode: 'pull-request';
      readonly branchPrefix: string;
      readonly baseBranch: string;
      readonly draft: boolean;
    };

interface GitHubResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

interface GitHubFileState {
  readonly path: string;
  readonly sha: string;
  readonly revision: string;
  readonly content: string;
}

interface GitHubCommitResult {
  readonly sha: string;
  readonly url?: string;
  readonly contentSha?: string;
}

/**
 * A Node.js-only GitHub Contents API adapter. It stores text only and keeps
 * physical repository concerns outside Pith's portable content contracts.
 */
export function createGitHubRepository(options: GitHubRepositoryOptions): GitHubContentRepository {
  const resolved = resolveOptions(options);
  const client = new GitHubClient(resolved);

  const repository: GitHubContentRepository = {
    provider: 'github',

    async read(path) {
      const logicalPath = normalizePath(path, 'Repository file path');

      try {
        const file = await readFile(client, resolved.branch, logicalPath);

        return {
          path: logicalPath,
          content: file.content,
          revision: file.revision,
        } satisfies RepositoryFile;
      } catch (error) {
        if (isNotFound(error)) {
          await assertBranchExists(client, resolved);
          return null;
        }

        throw error;
      }
    },

    async list(directory) {
      const logicalDirectory = normalizePath(directory, 'Repository directory');

      try {
        return await listDirectory(client, resolved.branch, logicalDirectory);
      } catch (error) {
        if (isNotFound(error)) {
          await assertBranchExists(client, resolved);
          return [];
        }

        throw error;
      }
    },

    async readAtRef(path, ref) {
      const logicalPath = normalizePath(path, 'Repository file path');
      const safeRef = normalizeRef(ref);

      try {
        const file = await readFile(client, safeRef, logicalPath);
        return {
          path: logicalPath,
          content: file.content,
          revision: file.revision,
        } satisfies RepositoryFile;
      } catch (error) {
        if (isNotFound(error)) {
          await assertRefExists(client, safeRef);
          return null;
        }

        throw error;
      }
    },

    async listAtRef(directory, ref) {
      const logicalDirectory = normalizePath(directory, 'Repository directory');
      const safeRef = normalizeRef(ref);

      try {
        return await listDirectory(client, safeRef, logicalDirectory);
      } catch (error) {
        if (isNotFound(error)) {
          await assertRefExists(client, safeRef);
          return [];
        }

        throw error;
      }
    },

    async write(input) {
      const logicalPath = normalizePath(input.path, 'Repository file path');
      assertCommitMessage(input.message);
      assertContentSize(input.content);
      const targetBranch =
        resolved.publishing.mode === 'pull-request'
          ? resolved.publishing.baseBranch
          : resolved.branch;
      const current = await readOptionalFile(client, resolved, targetBranch, logicalPath);

      assertWritePreconditions(input, current, logicalPath);

      if (resolved.publishing.mode === 'direct') {
        const commit = await writeFile(client, {
          branch: resolved.branch,
          path: logicalPath,
          content: input.content,
          message: input.message,
          ...(current === null ? {} : { sha: current.sha }),
          ...(resolved.commitAuthor === undefined ? {} : { author: resolved.commitAuthor }),
          createOnly: input.createOnly === true,
          direct: true,
        });

        return toWriteResult(logicalPath, commit, directPublication(resolved.branch, commit));
      }

      const publication = await publishPullRequest(client, resolved, {
        operation: operationFromMessage(input.message),
        path: logicalPath,
        message: input.message,
        content: input.content,
        ...(current === null ? {} : { sha: current.sha }),
        createOnly: input.createOnly === true,
      });

      return toWriteResult(logicalPath, publication.commit, publication.result);
    },

    async delete(input) {
      const logicalPath = normalizePath(input.path, 'Repository file path');
      assertCommitMessage(input.message);

      const targetBranch =
        resolved.publishing.mode === 'pull-request'
          ? resolved.publishing.baseBranch
          : resolved.branch;
      const current = await readOptionalFile(client, resolved, targetBranch, logicalPath);

      if (!current) {
        throw new RepositoryNotFoundError(undefined, { metadata: { path: logicalPath } });
      }

      if (!input.expectedRevision) {
        throw new RepositoryConflictError('Deleting GitHub content requires a current revision.', {
          metadata: { path: logicalPath },
        });
      }

      assertExpectedRevision(input.expectedRevision, current, logicalPath);

      if (resolved.publishing.mode === 'direct') {
        const commit = await deleteFile(client, {
          branch: resolved.branch,
          path: logicalPath,
          sha: current.sha,
          message: input.message,
          ...(resolved.commitAuthor === undefined ? {} : { author: resolved.commitAuthor }),
          direct: true,
        });

        return toDeleteResult(logicalPath, directPublication(resolved.branch, commit));
      }

      const publication = await publishPullRequest(client, resolved, {
        operation: operationFromMessage(input.message),
        path: logicalPath,
        message: input.message,
        deleteSha: current.sha,
      });

      return toDeleteResult(logicalPath, publication.result);
    },

    async verifyConnection() {
      const repositoryInfo = await client.request('GET', client.repositoryPath());
      assertSuccess(repositoryInfo, 'repository');
      await getBranchHead(client, resolved.branch, resolved);

      const user = await client.request('GET', '/user');
      assertSuccess(user, 'authentication');
      const authenticatedAs = stringProperty(user.body, 'login');

      return {
        repository: `${resolved.owner}/${resolved.repository}`,
        branch: resolved.branch,
        ...(authenticatedAs === undefined ? {} : { authenticatedAs }),
        publishingMode: resolved.publishing.mode,
        canRead: true,
        canWrite: true,
        canCreatePullRequests: resolved.publishing.mode === 'pull-request',
      } satisfies GitHubConnectionResult;
    },

    async getPublicationStatus(publication) {
      return getPublicationStatus(client, publication);
    },
  };

  return repository;
}

class GitHubClient {
  private installationToken: { readonly token: string; readonly expiresAt: number } | undefined;

  constructor(private readonly options: ResolvedOptions) {}

  repositoryPath(): string {
    return `/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repository)}`;
  }

  async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retryable = method === 'GET',
  ): Promise<GitHubResponse> {
    const authHeader = await this.getAuthorizationHeader();
    return this.send(method, path, body, authHeader, retryable);
  }

  async send(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    authorization: string,
    retryable: boolean,
  ): Promise<GitHubResponse> {
    const request = (): GitHubTransportRequest => ({
      method,
      url: new URL(path, `${this.options.apiBaseUrl}/`).toString(),
      headers: {
        accept: 'application/vnd.github+json',
        authorization,
        'user-agent': `pith-cms/${pkgVersion}`,
        'x-github-api-version': GITHUB_API_VERSION,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.options.transport(request());
        const parsed = await parseResponse(response);

        if (retryable && parsed.status >= 500 && attempt < 1) {
          continue;
        }

        return parsed;
      } catch (error) {
        if (retryable && attempt < 1) {
          continue;
        }

        throw new GitHubApiError('GitHub could not be reached for this repository operation.', {
          cause: error,
        });
      }
    }
  }

  private async getAuthorizationHeader(): Promise<string> {
    if (this.options.auth.type === 'token') {
      return `Bearer ${this.options.auth.token}`;
    }

    const now = Date.now();

    if (
      this.installationToken &&
      this.installationToken.expiresAt - now > INSTALLATION_TOKEN_REFRESH_WINDOW_SECONDS * 1000
    ) {
      return `Bearer ${this.installationToken.token}`;
    }

    const appToken = createAppJwt(this.options.auth);
    const response = await this.send(
      'POST',
      `/app/installations/${encodeURIComponent(this.options.auth.installationId)}/access_tokens`,
      {},
      `Bearer ${appToken}`,
      false,
    );
    assertSuccess(response, 'authentication');
    const token = stringProperty(response.body, 'token');
    const expiresAt = stringProperty(response.body, 'expires_at');

    if (!token || !expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      throw new GitHubAuthenticationError(
        'GitHub returned an invalid installation token response.',
      );
    }

    this.installationToken = { token, expiresAt: Date.parse(expiresAt) };
    return `Bearer ${token}`;
  }
}

async function readFile(
  client: GitHubClient,
  branch: string,
  path: string,
): Promise<GitHubFileState> {
  const response = await client.request(
    'GET',
    `${client.repositoryPath()}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
  );

  if (response.status === 404) {
    throw new GitHubHttpNotFoundError();
  }

  assertSuccess(response, 'read');
  return parseFileResponse(response.body, path);
}

async function readOptionalFile(
  client: GitHubClient,
  options: ResolvedOptions,
  branch: string,
  path: string,
): Promise<GitHubFileState | null> {
  try {
    return await readFile(client, branch, path);
  } catch (error) {
    if (isNotFound(error)) {
      await getBranchHead(client, branch, options);
      return null;
    }

    throw error;
  }
}

async function listDirectory(
  client: GitHubClient,
  branch: string,
  directory: string,
): Promise<RepositoryFileSummary[]> {
  const response = await client.request(
    'GET',
    `${client.repositoryPath()}/contents/${encodePath(directory)}?ref=${encodeURIComponent(branch)}`,
  );

  if (response.status === 404) {
    throw new GitHubHttpNotFoundError();
  }

  assertSuccess(response, 'list');

  if (!Array.isArray(response.body)) {
    throw new RepositoryError('The requested GitHub directory is a file, not a directory.', {
      metadata: { path: directory },
    });
  }

  const files: RepositoryFileSummary[] = [];

  for (const entry of response.body) {
    if (!isRecord(entry)) {
      throw new GitHubApiError('GitHub returned an invalid directory listing.');
    }

    if (entry.type !== 'file') {
      continue;
    }

    const path = stringProperty(entry, 'path');
    const sha = stringProperty(entry, 'sha');

    if (!path || !sha) {
      throw new GitHubApiError('GitHub returned an invalid file summary.');
    }

    const logicalPath = normalizePath(path, 'GitHub repository path');

    if (logicalPath.split('/').at(-1)?.startsWith('.pith-tmp-')) {
      continue;
    }

    files.push({ path: logicalPath, revision: toRevision(sha) });
  }

  return files.sort((left, right) =>
    left.path === right.path ? 0 : left.path < right.path ? -1 : 1,
  );
}

async function writeFile(
  client: GitHubClient,
  input: {
    readonly branch: string;
    readonly path: string;
    readonly content: string;
    readonly message: string;
    readonly sha?: string;
    readonly author?: { readonly name: string; readonly email: string };
    readonly createOnly: boolean;
    readonly direct?: boolean;
  },
): Promise<GitHubCommitResult> {
  const response = await client.request(
    'PUT',
    `${client.repositoryPath()}/contents/${encodePath(input.path)}`,
    {
      message: input.message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch: input.branch,
      ...(input.sha === undefined ? {} : { sha: input.sha }),
      ...(input.author === undefined ? {} : { author: input.author }),
    },
    false,
  );

  if ((response.status === 409 || response.status === 422) && input.createOnly) {
    throw new ContentAlreadyExistsError(undefined, { metadata: { path: input.path } });
  }

  if (response.status === 409 || response.status === 422) {
    throw new RepositoryConflictError(undefined, { metadata: { path: input.path } });
  }

  if (response.status === 403 && input.direct) {
    throw new GitHubBranchProtectionError({ cause: response.body });
  }

  assertSuccess(response, 'write');
  return parseCommitResponse(response.body, true);
}

async function deleteFile(
  client: GitHubClient,
  input: {
    readonly branch: string;
    readonly path: string;
    readonly sha: string;
    readonly message: string;
    readonly author?: { readonly name: string; readonly email: string };
    readonly direct?: boolean;
  },
): Promise<GitHubCommitResult> {
  const response = await client.request(
    'DELETE',
    `${client.repositoryPath()}/contents/${encodePath(input.path)}`,
    {
      message: input.message,
      sha: input.sha,
      branch: input.branch,
      ...(input.author === undefined ? {} : { author: input.author }),
    },
    false,
  );

  if (response.status === 404) {
    throw new RepositoryNotFoundError(undefined, { metadata: { path: input.path } });
  }

  if (response.status === 409 || response.status === 422) {
    throw new RepositoryConflictError(undefined, { metadata: { path: input.path } });
  }

  if (response.status === 403 && input.direct) {
    throw new GitHubBranchProtectionError({ cause: response.body });
  }

  assertSuccess(response, 'delete');
  return parseCommitResponse(response.body, false);
}

async function publishPullRequest(
  client: GitHubClient,
  options: ResolvedOptions,
  input: {
    readonly operation: string;
    readonly path: string;
    readonly message: string;
    readonly content?: string;
    readonly sha?: string;
    readonly deleteSha?: string;
    readonly createOnly?: boolean;
  },
): Promise<{ readonly commit: GitHubCommitResult; readonly result: GitHubPublishingResult }> {
  if (options.publishing.mode !== 'pull-request') {
    throw new GitHubApiError('Pull-request publishing is not configured.');
  }

  const baseHead = await getBranchHead(client, options.publishing.baseBranch, options);
  const branch = await createWorkingBranch(client, options, input.operation, input.path, baseHead);
  let commit: GitHubCommitResult;

  if (input.deleteSha) {
    commit = await deleteFile(client, {
      branch,
      path: input.path,
      sha: input.deleteSha,
      message: input.message,
      ...(options.commitAuthor === undefined ? {} : { author: options.commitAuthor }),
    });
  } else if (input.content !== undefined) {
    commit = await writeFile(client, {
      branch,
      path: input.path,
      content: input.content,
      message: input.message,
      ...(input.sha === undefined ? {} : { sha: input.sha }),
      ...(options.commitAuthor === undefined ? {} : { author: options.commitAuthor }),
      createOnly: input.createOnly === true,
    });
  } else {
    throw new GitHubApiError('The pull-request publication did not contain a file operation.');
  }

  const pullRequest = await client.request(
    'POST',
    `${client.repositoryPath()}/pulls`,
    {
      title: input.message,
      head: branch,
      base: options.publishing.baseBranch,
      body: pullRequestBody(input.message),
      draft: options.publishing.draft,
    },
    false,
  );

  if (!isSuccess(pullRequest.status)) {
    throw new GitHubPullRequestError(undefined, { cause: pullRequest.body });
  }

  const number = numberProperty(pullRequest.body, 'number');
  const reviewUrl = stringProperty(pullRequest.body, 'html_url');

  if (number === undefined || reviewUrl === undefined) {
    throw new GitHubPullRequestError('GitHub returned an invalid pull-request response.');
  }

  return {
    commit,
    result: {
      provider: 'github',
      mode: 'pull-request',
      branch,
      commitSha: commit.sha,
      ...(commit.url === undefined ? {} : { commitUrl: commit.url }),
      reviewNumber: number,
      reviewUrl,
    },
  };
}

async function getBranchHead(
  client: GitHubClient,
  branch: string,
  options: ResolvedOptions | undefined,
): Promise<string> {
  const response = await client.request(
    'GET',
    `${client.repositoryPath()}/git/ref/heads/${encodePath(branch)}`,
  );

  if (response.status === 404) {
    if (options) {
      await assertRepositoryExists(client);
    }

    throw new GitHubBranchNotFoundError(undefined, { cause: response.body });
  }

  assertSuccess(response, 'branch');
  const object = recordProperty(response.body, 'object');
  const sha = object ? stringProperty(object, 'sha') : undefined;

  if (!sha) {
    throw new GitHubApiError('GitHub returned an invalid branch reference.');
  }

  return sha;
}

async function createWorkingBranch(
  client: GitHubClient,
  options: ResolvedOptions,
  operation: string,
  path: string,
  baseHead: string,
): Promise<string> {
  if (options.publishing.mode !== 'pull-request') {
    throw new GitHubApiError('Pull-request publishing is not configured.');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const branch = createBranchName(options.publishing.branchPrefix, operation, path);
    const response = await client.request(
      'POST',
      `${client.repositoryPath()}/git/refs`,
      { ref: `refs/heads/${branch}`, sha: baseHead },
      false,
    );

    if (response.status === 422) {
      continue;
    }

    assertSuccess(response, 'branch');
    return branch;
  }

  throw new GitHubPullRequestError('GitHub could not allocate a unique Pith pull-request branch.');
}

async function assertBranchExists(
  client: GitHubClient,
  options: ResolvedOptions | undefined,
): Promise<void> {
  const branch = options?.branch;

  if (!branch) {
    return;
  }

  await getBranchHead(client, branch, options);
}

async function assertRepositoryExists(client: GitHubClient): Promise<void> {
  const response = await client.request('GET', client.repositoryPath());

  if (response.status === 404) {
    throw new GitHubRepositoryNotFoundError(undefined, { cause: response.body });
  }

  assertSuccess(response, 'repository');
}

async function assertRefExists(client: GitHubClient, ref: string): Promise<void> {
  const response = await client.request(
    'GET',
    `${client.repositoryPath()}/commits/${encodeURIComponent(ref)}`,
  );

  if (response.status === 404) {
    throw new GitHubBranchNotFoundError('The requested GitHub preview reference was not found.');
  }

  assertSuccess(response, 'reference');
}

async function getPublicationStatus(
  client: GitHubClient,
  publication: RepositoryPublicationReference,
): Promise<RepositoryPublicationStatus> {
  if (publication.provider !== 'github') {
    return { state: 'unknown' };
  }

  if (publication.mode === 'direct') {
    return { state: 'committed' };
  }

  if (publication.mode !== 'pull-request' || !Number.isSafeInteger(publication.reviewNumber)) {
    return { state: 'unknown' };
  }

  const response = await client.request(
    'GET',
    `${client.repositoryPath()}/pulls/${encodeURIComponent(String(publication.reviewNumber))}`,
  );

  if (response.status === 404) {
    return { state: 'unknown' };
  }

  assertSuccess(response, 'pull request');

  const state = stringProperty(response.body, 'state');
  const merged = isRecord(response.body) && response.body.merged === true;

  if (merged) {
    const mergedAt = stringProperty(response.body, 'merged_at');
    return { state: 'review-merged', ...(mergedAt === undefined ? {} : { mergedAt }) };
  }

  if (state === 'open') {
    return { state: 'review-open' };
  }

  if (state === 'closed') {
    const closedAt = stringProperty(response.body, 'closed_at');
    return { state: 'review-closed', ...(closedAt === undefined ? {} : { closedAt }) };
  }

  return { state: 'unknown' };
}

function assertWritePreconditions(
  input: WriteFileInput,
  current: GitHubFileState | null,
  path: string,
): void {
  if (input.createOnly && current) {
    throw new ContentAlreadyExistsError(undefined, { metadata: { path } });
  }

  if (input.expectedRevision !== undefined) {
    if (!current) {
      throw new RepositoryConflictError(undefined, {
        metadata: { path, expectedRevision: input.expectedRevision },
      });
    }

    assertExpectedRevision(input.expectedRevision, current, path);
  }
}

function assertExpectedRevision(
  expectedRevision: string,
  current: GitHubFileState,
  path: string,
): void {
  if (
    !/^github-sha:[0-9a-f]{40,64}$/i.test(expectedRevision) ||
    expectedRevision !== current.revision
  ) {
    throw new RepositoryConflictError(undefined, {
      metadata: {
        path,
        expectedRevision,
        actualRevision: current.revision,
      },
    });
  }
}

function parseFileResponse(body: unknown, expectedPath: string): GitHubFileState {
  if (!isRecord(body) || body.type !== 'file') {
    throw new RepositoryError('The requested GitHub path is not a regular text file.', {
      metadata: { path: expectedPath },
    });
  }

  const path = stringProperty(body, 'path');
  const sha = stringProperty(body, 'sha');
  const encoding = stringProperty(body, 'encoding');
  const content = stringProperty(body, 'content');
  const size = numberProperty(body, 'size');

  if (!path || !sha || encoding !== 'base64' || content === undefined) {
    throw new GitHubApiError('GitHub returned an unsupported file response.');
  }

  if (size !== undefined && size > MAX_TEXT_CONTENT_BYTES) {
    throw new RepositoryError('The GitHub content file exceeds Pith’s supported text size.', {
      metadata: { path: expectedPath },
    });
  }

  const bytes = decodeBase64(content);

  if (bytes.byteLength > MAX_TEXT_CONTENT_BYTES) {
    throw new RepositoryError('The GitHub content file exceeds Pith’s supported text size.', {
      metadata: { path: expectedPath },
    });
  }

  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new RepositoryError('The GitHub content file is not valid UTF-8 text.', {
      cause: error,
      metadata: { path: expectedPath },
    });
  }

  if (text.includes('\0')) {
    throw new RepositoryError('The GitHub content file is not supported text content.', {
      metadata: { path: expectedPath },
    });
  }

  return {
    path: normalizePath(path, 'GitHub repository path'),
    sha,
    revision: toRevision(sha),
    content: text,
  };
}

function parseCommitResponse(body: unknown, includesContent: boolean): GitHubCommitResult {
  if (!isRecord(body)) {
    throw new GitHubApiError('GitHub returned an invalid commit response.');
  }

  const commit = recordProperty(body, 'commit');
  const sha = commit ? stringProperty(commit, 'sha') : undefined;
  const url = commit ? stringProperty(commit, 'html_url') : undefined;
  const content = includesContent ? recordProperty(body, 'content') : undefined;
  const contentSha = content ? stringProperty(content, 'sha') : undefined;

  if (!sha || (includesContent && !contentSha)) {
    throw new GitHubApiError('GitHub returned an invalid commit response.');
  }

  return {
    sha,
    ...(url === undefined ? {} : { url }),
    ...(contentSha === undefined ? {} : { contentSha }),
  };
}

function toWriteResult(
  path: string,
  commit: GitHubCommitResult,
  publication: GitHubPublishingResult,
): GitHubWriteFileResult {
  if (!commit.contentSha) {
    throw new GitHubApiError('GitHub did not return a new file revision.');
  }

  return {
    provider: 'github',
    path,
    revision: toRevision(commit.contentSha),
    publication,
  };
}

function toDeleteResult(path: string, publication: GitHubPublishingResult): GitHubDeleteFileResult {
  return { provider: 'github', path, publication };
}

function directPublication(branch: string, commit: GitHubCommitResult): GitHubPublishingResult {
  return {
    provider: 'github',
    mode: 'direct',
    branch,
    commitSha: commit.sha,
    ...(commit.url === undefined ? {} : { commitUrl: commit.url }),
  };
}

function pullRequestBody(message: string): string {
  const match = /^(Create|Update|Delete)\s+([^:]+):\s+(.+)$/i.exec(message);
  const operation = match?.[1]?.toLowerCase() ?? 'update';
  const collection = match?.[2] ?? 'unknown';
  const identifier = match?.[3] ?? 'entry';

  return [
    'Published through Pith.',
    '',
    `Collection: ${collection}`,
    `Entry: ${identifier}`,
    `Operation: ${operation}`,
  ].join('\n');
}

function operationFromMessage(message: string): string {
  const match = /^(Create|Update|Delete)\b/i.exec(message);
  return match?.[1]?.toLowerCase() ?? 'update';
}

function createBranchName(prefix: string, operation: string, path: string): string {
  const safeOperation = sanitizeBranchSegment(operation);
  const safePath = path
    .split('/')
    .map(sanitizeBranchSegment)
    .filter(Boolean)
    .join('-')
    .slice(0, 80);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  return `${prefix}${safeOperation}/${safePath || 'entry'}-${suffix}`;
}

function sanitizeBranchSegment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, '-')
    .replaceAll(/[-.]{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 80);
}

function resolveOptions(options: GitHubRepositoryOptions): ResolvedOptions {
  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('GitHub repository options are required.');
  }

  const owner = requiredName(options.owner, 'GitHub owner');
  const repository = requiredName(options.repository, 'GitHub repository');
  const branch = requiredBranch(options.branch, 'GitHub branch');
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const auth = resolveAuth(options.auth);
  const publishing = resolvePublishing(options.publishing, branch);
  const commitAuthor = resolveCommitAuthor(options.commitAuthor);

  return {
    owner,
    repository,
    branch,
    auth,
    publishing,
    apiBaseUrl,
    ...(commitAuthor === undefined ? {} : { commitAuthor }),
    transport:
      options.transport ??
      ((request) =>
        fetch(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.body === undefined ? {} : { body: request.body }),
        })),
  };
}

function resolveAuth(auth: GitHubAuthOptions): ResolvedAuth {
  if (!auth || typeof auth !== 'object') {
    throw new ConfigurationError('GitHub authentication must use a token or GitHub App settings.');
  }

  if ('token' in auth) {
    if ('app' in auth) {
      throw new ConfigurationError(
        'GitHub authentication cannot combine token and GitHub App settings.',
      );
    }

    if (typeof auth.token !== 'string' || auth.token.trim().length === 0) {
      throw new ConfigurationError('GitHub token authentication requires a non-empty token.');
    }

    return { type: 'token', token: auth.token.trim() };
  }

  if (!auth || !('app' in auth) || !auth.app) {
    throw new ConfigurationError('GitHub authentication must use a token or GitHub App settings.');
  }

  const appId = requiredNumericString(auth.app.appId, 'GitHub App ID');
  const installationId = requiredNumericString(
    auth.app.installationId,
    'GitHub App installation ID',
  );
  if (typeof auth.app.privateKey !== 'string') {
    throw new ConfigurationError('GitHub App privateKey must be a PEM private key.');
  }

  const normalizedKey = auth.app.privateKey.replaceAll('\\n', '\n').trim();

  if (!normalizedKey.includes('-----BEGIN') || !normalizedKey.includes('PRIVATE KEY-----')) {
    throw new ConfigurationError('GitHub App privateKey must be a PEM private key.');
  }

  try {
    return {
      type: 'app',
      appId,
      installationId,
      privateKey: createPrivateKey(normalizedKey),
    };
  } catch (error) {
    throw new ConfigurationError('GitHub App privateKey is invalid.', { cause: error });
  }
}

function resolvePublishing(
  publishing: GitHubPublishingOptions | undefined,
  branch: string,
): ResolvedPublishing {
  if (publishing === undefined || publishing.mode === 'direct') {
    return { mode: 'direct' };
  }

  if (publishing.mode !== 'pull-request') {
    throw new ConfigurationError('GitHub publishing mode must be "direct" or "pull-request".');
  }

  const branchPrefix = resolveBranchPrefix(publishing.branchPrefix ?? 'pith/');
  const baseBranch = requiredBranch(
    publishing.baseBranch ?? branch,
    'GitHub pull-request base branch',
  );

  return {
    mode: 'pull-request',
    branchPrefix,
    baseBranch,
    draft: publishing.draft === true,
  };
}

function resolveApiBaseUrl(value: string | undefined): string {
  const candidate = value ?? 'https://api.github.com';
  let url: URL;

  try {
    url = new URL(candidate);
  } catch (error) {
    throw new ConfigurationError('GitHub apiBaseUrl must be a valid URL.', { cause: error });
  }

  const localTestHost = url.hostname === 'localhost' || url.hostname.endsWith('.test');

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localTestHost)) {
    throw new ConfigurationError(
      'GitHub apiBaseUrl must use HTTPS outside local test environments.',
    );
  }

  return url.toString().replace(/\/$/, '');
}

function resolveCommitAuthor(
  author: GitHubRepositoryOptions['commitAuthor'],
): { readonly name: string; readonly email: string } | undefined {
  if (author === undefined) {
    return undefined;
  }

  if (
    typeof author.name !== 'string' ||
    author.name.trim().length === 0 ||
    /[\r\n]/.test(author.name) ||
    typeof author.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email)
  ) {
    throw new ConfigurationError(
      'GitHub commitAuthor must contain a valid name and email address.',
    );
  }

  return { name: author.name.trim(), email: author.email.trim() };
}

function requiredName(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    /[\\/\s]/.test(value) ||
    value.includes('..')
  ) {
    throw new ConfigurationError(`${label} must be a non-empty repository name.`);
  }

  return value.trim();
}

function requiredBranch(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    /[\s~^:?*]/.test(value) ||
    value.includes('\\') ||
    value.includes('[') ||
    containsControlCharacters(value) ||
    value.includes('..') ||
    value.startsWith('/') ||
    value.endsWith('/')
  ) {
    throw new ConfigurationError(`${label} is invalid.`);
  }

  return value;
}

function requiredNumericString(value: string, label: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ConfigurationError(`${label} must be a numeric string.`);
  }

  return value;
}

function resolveBranchPrefix(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('..') ||
    /[\s~^:?*]/.test(value) ||
    value.includes('\\') ||
    value.includes('[') ||
    containsControlCharacters(value)
  ) {
    throw new ConfigurationError('GitHub pull-request branchPrefix is invalid.');
  }

  return value.endsWith('/') ? value : `${value}/`;
}

function createAppJwt(auth: Extract<ResolvedAuth, { readonly type: 'app' }>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: auth.appId }));
  const signed = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signed), auth.privateKey).toString('base64url');
  return `${signed}.${signature}`;
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

async function parseResponse(response: Response): Promise<GitHubResponse> {
  const text = await response.text();
  let body: unknown = undefined;

  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) {
        throw new GitHubApiError('GitHub returned a malformed API response.');
      }
    }
  }

  return { status: response.status, headers: response.headers, body };
}

function assertSuccess(response: GitHubResponse, operation: string): void {
  if (isSuccess(response.status)) {
    return;
  }

  if (response.status === 401) {
    throw new GitHubAuthenticationError(undefined, { cause: response.body });
  }

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const retryAfter = numericHeader(response.headers, 'retry-after');
    const resetAt = rateLimitReset(response.headers);

    if (remaining === '0' || retryAfter !== undefined) {
      throw new GitHubRateLimitError({
        ...(retryAfter === undefined ? {} : { retryAfter }),
        ...(resetAt === undefined ? {} : { resetAt }),
        cause: response.body,
      });
    }

    throw new GitHubAuthorizationError(undefined, { cause: response.body });
  }

  if (response.status === 404 && operation === 'repository') {
    throw new GitHubRepositoryNotFoundError(undefined, { cause: response.body });
  }

  throw new GitHubApiError('GitHub could not complete the repository operation.', {
    cause: response.body,
  });
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function numericHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  return value && /^\d+$/.test(value) ? Number(value) : undefined;
}

function rateLimitReset(headers: Headers): string | undefined {
  const seconds = numericHeader(headers, 'x-ratelimit-reset');
  return seconds === undefined ? undefined : new Date(seconds * 1000).toISOString();
}

function normalizePath(value: string, label: string): string {
  try {
    const normalized = normalizeContentPath(value, label);

    if (/^(?:file|https?|git):/i.test(normalized)) {
      throw new ContentPathError(`${label} must be a logical repository path.`);
    }

    return normalized;
  } catch (error) {
    if (error instanceof ContentPathError) {
      throw error;
    }

    throw new ContentPathError(`${label} is invalid.`, { cause: error });
  }
}

function normalizeRef(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    containsControlCharacters(value) ||
    value.includes('..') ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    /^(?:file|https?|git):/i.test(value)
  ) {
    throw new ContentPathError(
      'Repository preview references must be a safe branch, tag, or commit ref.',
    );
  }

  return value;
}

function assertCommitMessage(message: string): void {
  if (
    typeof message !== 'string' ||
    message.trim().length === 0 ||
    message.length > MAX_COMMIT_MESSAGE_LENGTH ||
    /[\r\n]/.test(message) ||
    containsControlCharacters(message)
  ) {
    throw new ConfigurationError('GitHub commit messages must be non-empty single-line text.');
  }
}

function assertContentSize(content: string): void {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT_CONTENT_BYTES) {
    throw new RepositoryError('The GitHub content file exceeds Pith’s supported text size.');
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toRevision(sha: string): string {
  return `github-sha:${sha}`;
}

function decodeBase64(value: string): Buffer {
  const normalized = value.replaceAll(/\s/g, '');

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
    throw new GitHubApiError('GitHub returned an invalid file encoding.');
  }

  return Buffer.from(normalized, 'base64');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint < 32;
  });
}

function recordProperty(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];
  return isRecord(property) ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'string' ? property : undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];
  return typeof property === 'number' && Number.isFinite(property) ? property : undefined;
}

class GitHubHttpNotFoundError extends Error {}

function isNotFound(error: unknown): error is GitHubHttpNotFoundError {
  return error instanceof GitHubHttpNotFoundError;
}
