import {
  RepositoryConflictError,
  type ContentRepository,
  type DeleteFileInput,
  type DeleteFileResult,
  type RepositoryFile,
  type RepositoryFileSummary,
  type WriteFileInput,
  type WriteFileResult,
} from '@pith-cms/core';
import { describe, expect, it } from 'vitest';

import { createPith } from '../src/server-implementation.js';
import type { PithAuthAdapter, PithAuthorizedUser, PithSession } from '../src/editor-types.js';
import { EDITOR_JSON_LIMIT_BYTES } from '../src/editor-security.js';
import { testConfig, validFiles } from './fixtures.js';

const allPermissions = [
  'content:read',
  'content:create',
  'content:update',
  'content:delete',
] as const;

describe('editor mutation handlers', () => {
  it('creates, validates, updates, conflicts, and deletes with logical paths only', async () => {
    const repository = new EditorRepository(validFiles);
    const pith = createPith({
      config: testConfig,
      repository,
      editor: { trustedOrigins: ['http://pith.test'] },
      auth: createTestAuth({ id: 'editor', permissions: allPermissions }),
    });
    const handlers = pith.editor.handlers;

    const created = await mutation(handlers.POST, 'POST', {
      collection: 'pages',
      identifier: 'new-page',
      value: { title: 'New page', slug: 'new-page' },
      csrfToken: 'csrf-token',
    });

    expect(created.status).toBe(200);
    expect((await created.json()).data.path).toBe('content/pages/new-page.json');
    expect(repository.writePaths).toEqual(['content/pages/new-page.json']);
    expect(repository.writeInputs[0]?.createOnly).toBe(true);

    const duplicate = await mutation(handlers.POST, 'POST', {
      collection: 'pages',
      identifier: 'new-page',
      value: { title: 'New page', slug: 'new-page' },
      csrfToken: 'csrf-token',
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe('CONTENT_ALREADY_EXISTS');

    const invalid = await mutation(handlers.POST, 'POST', {
      collection: 'pages',
      identifier: 'invalid',
      value: { title: 'Invalid', slug: 'not a slug' },
      csrfToken: 'csrf-token',
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.fieldErrors[0].path).toEqual(['slug']);

    const mismatchedIdentifier = await mutation(handlers.POST, 'POST', {
      collection: 'pages',
      identifier: 'path-identifier',
      value: { title: 'Mismatched identifier', slug: 'field-identifier' },
      csrfToken: 'csrf-token',
    });
    expect(mismatchedIdentifier.status).toBe(400);
    expect((await mismatchedIdentifier.json()).error.fieldErrors[0].code).toBe(
      'identifier_mismatch',
    );

    const current = await pith.content.getEntry('pages', 'new-page');
    const updated = await mutation(handlers.PUT, 'PUT', {
      collection: 'pages',
      identifier: 'new-page',
      value: { title: 'Updated page', slug: 'new-page' },
      expectedRevision: current.revision,
      csrfToken: 'csrf-token',
    });
    const updatedPayload = await updated.json();
    expect(updated.status).toBe(200);
    expect(updatedPayload.data.revision).not.toBe(current.revision);

    const stale = await mutation(handlers.PUT, 'PUT', {
      collection: 'pages',
      identifier: 'new-page',
      value: { title: 'Stale page', slug: 'new-page' },
      expectedRevision: current.revision,
      csrfToken: 'csrf-token',
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('REPOSITORY_CONFLICT');

    const deleted = await mutation(handlers.DELETE, 'DELETE', {
      collection: 'pages',
      identifier: 'new-page',
      expectedRevision: updatedPayload.data.revision,
      confirmDelete: true,
      csrfToken: 'csrf-token',
    });
    expect(deleted.status).toBe(200);
    await expect(pith.content.getOptionalEntry('pages', 'new-page')).resolves.toBeNull();
  });

  it('rejects unauthorized, cross-origin, missing-CSRF, malformed, and oversized mutations', async () => {
    const repository = new EditorRepository(validFiles);
    const readonly = createPith({
      config: testConfig,
      repository,
      editor: { trustedOrigins: ['http://pith.test'] },
      auth: createTestAuth({ id: 'reader', permissions: ['content:read'] }),
    });
    const payload = {
      collection: 'pages',
      identifier: 'blocked',
      value: { title: 'Blocked', slug: 'blocked' },
      csrfToken: 'csrf-token',
    };

    expect((await mutation(readonly.editor.handlers.POST, 'POST', payload)).status).toBe(403);
    expect(
      (
        await mutation(readonly.editor.handlers.POST, 'POST', payload, {
          origin: 'https://attacker.test',
        })
      ).status,
    ).toBe(403);

    const full = createPith({
      config: testConfig,
      repository,
      editor: { trustedOrigins: ['http://pith.test'] },
      auth: createTestAuth({ id: 'editor', permissions: allPermissions }),
    });
    expect(
      (
        await mutation(full.editor.handlers.POST, 'POST', {
          ...payload,
          csrfToken: 'invalid',
        })
      ).status,
    ).toBe(403);
    expect(
      (await mutation(full.editor.handlers.POST, 'POST', { ...payload, unexpected: true })).status,
    ).toBe(400);
    expect(
      (
        await mutation(full.editor.handlers.POST, 'POST', payload, {
          'content-type': 'text/plain',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation(full.editor.handlers.POST, 'POST', {
          ...payload,
          identifier: 'large-json',
          value: { title: 'x'.repeat(EDITOR_JSON_LIMIT_BYTES), slug: 'large-json' },
        })
      ).status,
    ).toBe(400);
  });

  it('returns safe provider publication metadata without coupling to an adapter package', async () => {
    const repository = new EditorRepository(validFiles, {
      provider: 'github',
      mode: 'pull-request',
      branch: 'pith/update/pages/home-a1b2c3d4',
      commitSha: 'abcdef1234567890',
      reviewNumber: 42,
      reviewUrl: 'https://github.example/acme/site/pull/42',
    });
    const pith = createPith({
      config: testConfig,
      repository,
      editor: { trustedOrigins: ['http://pith.test'] },
      auth: createTestAuth({ id: 'editor', permissions: allPermissions }),
    });
    const current = await pith.content.getEntry('pages', 'home');
    const response = await mutation(pith.editor.handlers.PUT, 'PUT', {
      collection: 'pages',
      identifier: 'home',
      value: { title: 'Published home', slug: 'home' },
      expectedRevision: current.revision,
      csrfToken: 'csrf-token',
    });

    expect(response.status).toBe(200);
    expect((await response.json()).data.publication).toEqual({
      provider: 'github',
      mode: 'pull-request',
      branch: 'pith/update/pages/home-a1b2c3d4',
      commitSha: 'abcdef1234567890',
      reviewNumber: 42,
      reviewUrl: 'https://github.example/acme/site/pull/42',
    });
  });
});

async function mutation(
  handler: (
    request: Request,
    context: { params: Promise<Record<string, readonly string[]>> },
  ) => Promise<Response>,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new Request('http://pith.test/api/pith/entries', {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://pith.test',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ pithRoute: ['entries'] }) },
  );
}

function createTestAuth(user: PithAuthorizedUser): PithAuthAdapter {
  const session: PithSession = {
    id: 'test-session',
    user,
    expiresAt: '2030-01-01T00:00:00.000Z',
    csrfSecret: 'test-csrf-secret',
  };

  return {
    async authenticate() {
      return user;
    },
    async authorize({ permission }) {
      return permission && !user.permissions.includes(permission) ? null : user;
    },
    async createSession() {
      return { ...session, cookie: '__pith_session=test' };
    },
    async readSession() {
      return session;
    },
    async destroySession() {
      return { cookie: '__pith_session=; Max-Age=0' };
    },
    async createCsrfToken() {
      return { token: 'csrf-token' };
    },
    async validateCsrfToken({ token }) {
      return token === 'csrf-token';
    },
  };
}

class EditorRepository implements ContentRepository {
  readonly files = new Map<string, RepositoryFile>();
  readonly writePaths: string[] = [];
  readonly writeInputs: WriteFileInput[] = [];
  private revision = 0;

  constructor(
    initial: Record<string, string>,
    private readonly publication?: NonNullable<WriteFileResult['publication']>,
  ) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, this.file(path, content));
    }
  }

  async read(path: string): Promise<RepositoryFile | null> {
    return this.files.get(path) ?? null;
  }

  async list(directory: string): Promise<RepositoryFileSummary[]> {
    const prefix = `${directory}/`;
    return [...this.files.values()]
      .filter(
        (file) => file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/'),
      )
      .map((file) => ({ path: file.path, revision: file.revision }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async write(input: WriteFileInput): Promise<WriteFileResult> {
    const current = this.files.get(input.path);
    this.writePaths.push(input.path);
    this.writeInputs.push(input);

    if (input.createOnly && current) {
      throw new RepositoryConflictError(undefined, {
        metadata: { actualRevision: current.revision },
      });
    }

    if (input.expectedRevision !== undefined && input.expectedRevision !== current?.revision) {
      throw new RepositoryConflictError(undefined, {
        metadata: { ...(current ? { actualRevision: current.revision } : {}) },
      });
    }

    const next = this.file(input.path, input.content);
    this.files.set(input.path, next);
    return {
      path: next.path,
      revision: next.revision,
      ...(this.publication === undefined ? {} : { publication: this.publication }),
    };
  }

  async delete(input: DeleteFileInput): Promise<DeleteFileResult> {
    const current = this.files.get(input.path);

    if (
      !current ||
      (input.expectedRevision !== undefined && input.expectedRevision !== current.revision)
    ) {
      throw new RepositoryConflictError(undefined, {
        metadata: { ...(current ? { actualRevision: current.revision } : {}) },
      });
    }

    this.files.delete(input.path);
    return {
      path: input.path,
      ...(this.publication === undefined ? {} : { publication: this.publication }),
    };
  }

  private file(path: string, content: string): RepositoryFile {
    this.revision += 1;
    return {
      path,
      content,
      revision: `revision-${this.revision}`,
    };
  }
}
