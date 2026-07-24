import type {
  ContentRepository,
  DeleteFileInput,
  DeleteFileResult,
  RepositoryFile,
  RepositoryFileSummary,
  WriteFileInput,
  WriteFileResult,
} from '@pith-cms/core';
import { ConfigurationError } from '@pith-cms/core';
import { describe, expect, it } from 'vitest';

import { createPith } from '../src/server-implementation.js';
import { createMemoryPreviewStore } from '../src/preview.js';
import type { PithAuthAdapter, PithAuthorizedUser, PithSession } from '../src/editor-types.js';
import type { PithPreviewRecord, PithPreviewStore } from '../src/types.js';
import { testConfig } from './fixtures.js';

const user: PithAuthorizedUser = {
  id: 'editor',
  permissions: ['content:read', 'content:create', 'content:update', 'content:delete'],
};

describe('preview sessions', () => {
  it('stores canonical serialized overlays server-side and never embeds content in the cookie or URL', async () => {
    const store = new RecordingPreviewStore();
    const pith = createPreviewPith(new RefRepository(), store);

    const result = await pith.preview!.createEntryPreview({
      user,
      collection: 'pages',
      identifier: 'preview-home',
      operation: 'create',
      value: { title: 'Private preview', slug: 'preview-home' },
    });

    expect(result.url).toBe('/preview-home');
    expect(result.cookie).not.toContain('Private preview');
    expect(result.cookie).not.toContain('preview-home');
    expect(store.record?.source).toMatchObject({
      type: 'entry-overlay',
      operation: 'create',
      collection: 'pages',
      identifier: 'preview-home',
    });
    expect((store.record?.source as { serializedContent?: string }).serializedContent).toContain(
      'Private preview',
    );
  });

  it('binds ref previews to a server-registered pull-request publication', async () => {
    const repository = new RefRepository();
    const pith = createPreviewPith(repository, new RecordingPreviewStore());
    const publication = {
      provider: 'github',
      mode: 'pull-request',
      branch: 'pith/update/pages/home-a1b2c3d4',
      reviewNumber: 42,
    } as const;

    await expect(
      pith.preview!.createRefPreview({
        user,
        collection: 'pages',
        identifier: 'home',
        operation: 'update',
        ref: publication.branch,
        publication,
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);

    pith.preview!.registerPublication({ userId: user.id, publication });
    await expect(
      pith.preview!.createRefPreview({
        user,
        collection: 'pages',
        identifier: 'home',
        operation: 'update',
        ref: publication.branch,
        publication,
      }),
    ).resolves.toMatchObject({ url: '/' });
    expect(repository.refReads).toEqual([
      'content/pages/home.json:pith/update/pages/home-a1b2c3d4',
    ]);
  });

  it('rejects weak secrets and overlong preview sessions during initialization', () => {
    expect(() =>
      createPith({
        config: testConfig,
        repository: new RefRepository(),
        editor: {},
        auth: createAuth(),
        preview: { secret: 'too-short', resolvePath: () => '/' },
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createPith({
        config: testConfig,
        repository: new RefRepository(),
        editor: {},
        auth: createAuth(),
        preview: {
          secret: 'preview-secret-that-is-longer-than-thirty-two-bytes',
          durationSeconds: 60 * 60 + 1,
          resolvePath: () => '/',
        },
      }),
    ).toThrow(ConfigurationError);
  });
});

describe('createMemoryPreviewStore', () => {
  it('shares records across store instances in the same process', async () => {
    const first = createMemoryPreviewStore();
    const record = createPreviewRecord('shared');
    await first.create(record);

    const second = createMemoryPreviewStore();

    expect(await second.read(record.id)).toEqual(record);
  });

  it('does not wipe records when a new store instance is created', async () => {
    const storeA = createMemoryPreviewStore();
    const existing = createPreviewRecord('survives-hmr');
    await storeA.create(existing);

    // Simulating HMR re-evaluation by creating a fresh store instance.
    const storeB = createMemoryPreviewStore();
    await storeB.create(createPreviewRecord('added-after'));

    const storeC = createMemoryPreviewStore();

    expect(await storeC.read(existing.id)).toEqual(existing);
  });
});

function createPreviewRecord(suffix: string): PithPreviewRecord {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    id: `record-${suffix}`,
    userId: 'user',
    instanceId: 'instance',
    url: '/',
    createdAt: now,
    expiresAt,
    source: {
      type: 'entry-overlay',
      operation: 'create',
      collection: 'pages',
      identifier: 'home',
      serializedContent: JSON.stringify({ title: `Preview ${suffix}`, slug: 'home' }),
    },
  };
}

function createPreviewPith(repository: RefRepository, store: PithPreviewStore) {
  return createPith({
    config: testConfig,
    repository,
    editor: {},
    auth: createAuth(),
    preview: {
      secret: 'preview-secret-that-is-longer-than-thirty-two-bytes',
      store,
      resolvePath: ({ collection, identifier }) =>
        collection === 'pages'
          ? identifier === 'home'
            ? '/'
            : `/${identifier}`
          : `/posts/${identifier}`,
    },
  });
}

function createAuth(): PithAuthAdapter {
  const session: PithSession = {
    id: 'session',
    user,
    expiresAt: '2030-01-01T00:00:00.000Z',
    csrfSecret: 'csrf',
  };
  return {
    async authenticate() {
      return user;
    },
    async authorize() {
      return user;
    },
    async createSession() {
      return { ...session, cookie: 'session=test' };
    },
    async readSession() {
      return session;
    },
    async destroySession() {
      return { cookie: 'session=; Max-Age=0' };
    },
    async createCsrfToken() {
      return { token: 'csrf' };
    },
    async validateCsrfToken() {
      return true;
    },
  };
}

class RecordingPreviewStore implements PithPreviewStore {
  record: PithPreviewRecord | null = null;

  async create(record: PithPreviewRecord): Promise<void> {
    this.record = record;
  }

  async read(id: string): Promise<PithPreviewRecord | null> {
    return this.record?.id === id ? this.record : null;
  }

  async delete(id: string): Promise<void> {
    if (this.record?.id === id) {
      this.record = null;
    }
  }
}

class RefRepository implements ContentRepository {
  readonly refReads: string[] = [];

  async read(path: string): Promise<RepositoryFile | null> {
    return path === 'content/pages/home.json'
      ? { path, content: '{"title":"Home","slug":"home"}\n', revision: 'revision-home' }
      : null;
  }

  async list(): Promise<RepositoryFileSummary[]> {
    return [];
  }

  async write(input: WriteFileInput): Promise<WriteFileResult> {
    return { path: input.path, revision: 'revision-write' };
  }

  async delete(input: DeleteFileInput): Promise<DeleteFileResult> {
    return { path: input.path };
  }

  async readAtRef(path: string, ref: string): Promise<RepositoryFile | null> {
    this.refReads.push(`${path}:${ref}`);
    return this.read(path);
  }

  async listAtRef(): Promise<RepositoryFileSummary[]> {
    return [];
  }
}
