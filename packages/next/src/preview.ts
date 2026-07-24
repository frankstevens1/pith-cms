import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { draftMode, headers } from 'next/headers';

import {
  ConfigurationError,
  ContentNotFoundError,
  ContentValidationError,
  RepositoryError,
  createContentService,
  getCollectionDirectory,
  getEntryPath,
  supportsRepositoryRefs,
  validateEntry,
} from '@pith-cms/core';
import type {
  CollectionDefinition,
  ContentEntry,
  ContentRepository,
  FieldRecord,
  PithConfig,
  RepositoryPublicationReference,
  RepositoryFile,
  RepositoryFileSummary,
} from '@pith-cms/core';

import type {
  EntryOverlayPreview,
  PithContentClient,
  PithPreview,
  PithPreviewContext,
  PithPreviewOptions,
  PithPreviewRecord,
  PithPreviewSession,
  PithPreviewSource,
  PithPreviewStore,
  PithRequestContentClient,
  PreviewContentEntry,
  PreviewContentMetadata,
  RepositoryRefPreview,
} from './types.js';

const DEFAULT_DURATION_SECONDS = 15 * 60;
const MAX_DURATION_SECONDS = 60 * 60;
const PREVIEW_COOKIE_NAME = 'pith_preview';
const MAX_PREVIEW_PATH_LENGTH = 2048;

interface ResolvedPreviewOptions {
  readonly secret: string;
  readonly durationSeconds: number;
  readonly store: PithPreviewStore;
  readonly resolvePath: PithPreviewOptions['resolvePath'];
  readonly instanceId: string;
}

interface PreviewCookiePayload {
  readonly id: string;
}

const memoryStoreKey = Symbol.for('@pith-cms/preview.memoryStore');

/**
 * Process-local preview storage. It intentionally trades distributed reliability
 * for a dependency-free development and single-instance default.
 *
 * The backing Map lives on `globalThis` so that separate module instances created
 * by Next.js in development mode (e.g. route handlers vs. page renders) share the
 * same store within one process, and so active sessions survive HMR re-evaluation.
 */
export function createMemoryPreviewStore(): PithPreviewStore {
  const records =
    (globalThis as unknown as Record<symbol, Map<string, PithPreviewRecord> | undefined>)[
      memoryStoreKey
    ] ?? new Map<string, PithPreviewRecord>();

  (globalThis as unknown as Record<symbol, Map<string, PithPreviewRecord>>)[memoryStoreKey] =
    records;

  return {
    async create(record) {
      pruneExpired(records);
      records.set(record.id, record);
    },
    async read(id) {
      const record = records.get(id) ?? null;

      if (record && Date.parse(record.expiresAt) <= Date.now()) {
        records.delete(id);
        return null;
      }

      return record;
    },
    async delete(id) {
      records.delete(id);
    },
  };
}

export function createPithPreview<TConfig extends PithConfig>(input: {
  readonly config: TConfig;
  readonly repository: ContentRepository;
  readonly auth: {
    readSession(request: Request): Promise<{ readonly user: { readonly id: string } } | null>;
  };
  readonly options: PithPreviewOptions;
}): PithPreview {
  const options = resolvePreviewOptions(input.config, input.options);
  const publications = new Map<string, RepositoryPublicationReference>();

  async function createEntryPreview({
    user,
    collection,
    identifier,
    operation,
    value,
    baseRevision,
  }: Parameters<PithPreview['createEntryPreview']>[0]): Promise<PithPreviewSession> {
    const definition = input.config.collections[collection];

    if (!definition) {
      throw new ConfigurationError(`Unknown collection "${collection}".`);
    }

    getEntryPath({ config: input.config, collection, identifier });

    if (operation === 'delete') {
      if (value !== undefined) {
        throw new ConfigurationError('Delete previews cannot include entry content.');
      }
    } else {
      const validation = validateEntry({
        collection: definition as unknown as CollectionDefinition<FieldRecord>,
        value,
      });

      if (!validation.success) {
        throw new ContentValidationError(
          'Content failed validation before previewing.',
          validation.errors,
        );
      }

      if (
        !isRecord(validation.data) ||
        validation.data[definition.identifierField] !== identifier
      ) {
        throw new ContentValidationError(
          'The entry identifier must match its configured identifier field.',
          [
            {
              code: 'identifier_mismatch',
              path: [definition.identifierField],
              message: `The ${definition.identifierField} field must match the entry identifier.`,
            },
          ],
        );
      }
    }

    const serializedContent =
      operation === 'delete'
        ? undefined
        : createContentService({
            config: input.config,
            repository: input.repository,
          }).serializeEntry(collection as Extract<keyof TConfig['collections'], string>, value);
    const source: EntryOverlayPreview = {
      type: 'entry-overlay',
      operation,
      collection,
      identifier,
      ...(serializedContent === undefined ? {} : { serializedContent }),
      ...(baseRevision === undefined ? {} : { baseRevision }),
    };

    return createSession(options, user.id, source, { collection, identifier, operation, value });
  }

  async function createRefPreview({
    user,
    collection,
    identifier,
    operation,
    ref,
    publication,
  }: Parameters<PithPreview['createRefPreview']>[0]): Promise<PithPreviewSession> {
    if (!input.config.collections[collection]) {
      throw new ConfigurationError(`Unknown collection "${collection}".`);
    }

    if (!supportsRepositoryRefs(input.repository)) {
      throw new ConfigurationError(
        'The configured repository does not support repository-ref previews.',
      );
    }

    if (
      !publication ||
      publication.branch !== ref ||
      !isTrustedPublication(publications, user.id, publication)
    ) {
      throw new ConfigurationError(
        'Repository-ref previews require a Pith-created publication result.',
      );
    }

    const path = getEntryPath({ config: input.config, collection, identifier });
    await input.repository.readAtRef(path, ref);
    const source: RepositoryRefPreview = {
      type: 'repository-ref',
      ref,
      ...(publication === undefined ? {} : { publication }),
    };
    return createSession(options, user.id, source, { collection, identifier, operation });
  }

  async function getContext(
    contextOptions: { readonly requireDraftMode?: boolean } = {},
  ): Promise<PithPreviewContext | null> {
    if (contextOptions.requireDraftMode !== false) {
      const draft = await draftMode();

      if (!draft.isEnabled) {
        return null;
      }
    }

    const request = new Request('http://pith.local', { headers: await headers() });
    const session = await input.auth.readSession(request);

    if (!session) {
      return null;
    }

    const id = readPreviewCookie(request, options.secret);

    if (!id) {
      return null;
    }

    const record = await options.store.read(id);

    if (
      !record ||
      record.userId !== session.user.id ||
      record.instanceId !== options.instanceId ||
      Date.parse(record.expiresAt) <= Date.now()
    ) {
      return null;
    }

    return { id: record.id, source: record.source, expiresAt: record.expiresAt, url: record.url };
  }

  async function disable(): Promise<{ readonly cookie: string }> {
    const request = new Request('http://pith.local', { headers: await headers() });
    const id = readPreviewCookie(request, options.secret);

    if (id) {
      await options.store.delete(id).catch(() => undefined);
    }

    const draft = await draftMode();
    draft.disable();
    return { cookie: clearPreviewCookie() };
  }

  return Object.freeze({
    createEntryPreview,
    createRefPreview,
    getContext,
    disable,
    registerPublication(input: {
      readonly userId: string;
      readonly publication: RepositoryPublicationReference;
    }) {
      const { userId, publication } = input;
      if (publication.branch && publication.mode === 'pull-request') {
        publications.set(publicationKey(userId, publication), publication);
      }
    },
  });

  async function createSession(
    resolved: ResolvedPreviewOptions,
    userId: string,
    source: PithPreviewSource,
    pathContext: {
      readonly collection: string;
      readonly identifier: string;
      readonly operation: 'create' | 'update' | 'delete';
      readonly value?: unknown;
    },
  ): Promise<PithPreviewSession> {
    const path = await resolved.resolvePath({
      collection: pathContext.collection,
      identifier: pathContext.identifier,
      operation: pathContext.operation,
      ...(pathContext.value === undefined ? {} : { value: pathContext.value }),
    });
    const url = validatePreviewPath(path);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + resolved.durationSeconds * 1000).toISOString();
    const id = randomUUID();
    await resolved.store.create({
      id,
      userId,
      instanceId: resolved.instanceId,
      source,
      url,
      createdAt: now.toISOString(),
      expiresAt,
    });

    return {
      url,
      expiresAt,
      cookie: createPreviewCookie({ id }, resolved.secret, resolved.durationSeconds),
    };
  }
}

/** Builds a request-scoped client; preview reads never reuse canonical persistent cache entries. */
export async function createPreviewAwareContentClient<TConfig extends PithConfig>(input: {
  readonly config: TConfig;
  readonly repository: ContentRepository;
  readonly canonical: PithContentClient<TConfig>;
  readonly preview?: PithPreview;
}): Promise<PithRequestContentClient<TConfig>> {
  const context = await input.preview?.getContext();

  if (!context) {
    return input.canonical as PithRequestContentClient<TConfig>;
  }

  const repository = createPreviewRepository(input.config, input.repository, context);
  const service = createContentService({ config: input.config, repository });
  const metadata = toPreviewMetadata(context);

  return {
    async getEntry(collection, identifier) {
      const entry = await service.getEntry(collection, identifier);

      if (!entry) {
        throw new ContentNotFoundError(undefined, { metadata: { collection, identifier } });
      }

      return addPreviewMetadata(entry, metadata, context, collection, identifier);
    },
    async getOptionalEntry(collection, identifier) {
      const entry = await service.getEntry(collection, identifier);
      return entry ? addPreviewMetadata(entry, metadata, context, collection, identifier) : null;
    },
    async listEntries(collection, listOptions) {
      const result = await service.listEntries(collection);
      return {
        entries: result.entries.map((entry) =>
          addPreviewMetadata(entry, metadata, context, collection, entry.identifier),
        ),
        invalidEntries: listOptions?.includeInvalid === false ? [] : result.invalidEntries,
      };
    },
    getCollection(collection) {
      return input.canonical.getCollection(collection);
    },
    async hasEntry(collection, identifier) {
      return (await service.getEntry(collection, identifier)) !== null;
    },
    async getEntryIdentifiers(collection) {
      const result = await service.listEntries(collection);
      return result.entries.map((entry) => entry.identifier).sort();
    },
  } as PithRequestContentClient<TConfig>;
}

function createPreviewRepository<TConfig extends PithConfig>(
  config: TConfig,
  repository: ContentRepository,
  context: PithPreviewContext,
): ContentRepository {
  if (context.source.type === 'repository-ref') {
    if (!supportsRepositoryRefs(repository)) {
      throw new ConfigurationError(
        'The configured repository does not support repository-ref previews.',
      );
    }

    const source = context.source;
    return {
      read: (path) => repository.readAtRef(path, source.ref),
      list: (directory) => repository.listAtRef(directory, source.ref),
      write: unsupportedPreviewMutation,
      delete: unsupportedPreviewMutation,
    };
  }

  const overlay = context.source;
  const targetPath = getEntryPath({
    config,
    collection: overlay.collection,
    identifier: overlay.identifier,
  });
  const { directory } = getCollectionDirectory(config, overlay.collection);
  const revision = `preview:${context.id}`;

  return {
    async read(path) {
      if (path !== targetPath) {
        return repository.read(path);
      }

      if (overlay.operation === 'delete') {
        return null;
      }

      return {
        path,
        content: overlay.serializedContent ?? '',
        revision,
      } satisfies RepositoryFile;
    },
    async list(requestedDirectory) {
      const files = await repository.list(requestedDirectory);

      if (requestedDirectory !== directory) {
        return files;
      }

      const withoutTarget = files.filter((file) => file.path !== targetPath);

      if (overlay.operation === 'delete') {
        return withoutTarget;
      }

      return [
        ...withoutTarget,
        { path: targetPath, revision } satisfies RepositoryFileSummary,
      ].sort((left, right) => left.path.localeCompare(right.path));
    },
    write: unsupportedPreviewMutation,
    delete: unsupportedPreviewMutation,
  };
}

async function unsupportedPreviewMutation(): Promise<never> {
  throw new RepositoryError('Preview content repositories are read-only.');
}

function addPreviewMetadata<TValue>(
  entry: ContentEntry<TValue>,
  preview: PreviewContentMetadata,
  context: PithPreviewContext,
  collection: string,
  identifier: string,
): PreviewContentEntry<TValue> {
  if (
    context.source.type === 'entry-overlay' &&
    (context.source.collection !== collection || context.source.identifier !== identifier)
  ) {
    return entry;
  }

  return { ...entry, preview };
}

function toPreviewMetadata(context: PithPreviewContext): PreviewContentMetadata {
  return context.source.type === 'entry-overlay'
    ? {
        isPreview: true,
        source: 'entry-overlay',
        expiresAt: context.expiresAt,
        ...(context.source.baseRevision === undefined
          ? {}
          : { baseRevision: context.source.baseRevision }),
      }
    : {
        isPreview: true,
        source: 'repository-ref',
        expiresAt: context.expiresAt,
        ref: context.source.ref,
      };
}

function resolvePreviewOptions<TConfig extends PithConfig>(
  config: TConfig,
  options: PithPreviewOptions,
): ResolvedPreviewOptions {
  if (!options || typeof options !== 'object' || typeof options.resolvePath !== 'function') {
    throw new ConfigurationError('Preview configuration requires a resolvePath function.');
  }

  if (
    typeof options.secret !== 'string' ||
    Buffer.byteLength(options.secret, 'utf8') < 32 ||
    options.secret.startsWith('NEXT_PUBLIC_')
  ) {
    throw new ConfigurationError(
      'Preview configuration requires a separate secret of at least 32 bytes.',
    );
  }

  const durationSeconds = options.durationSeconds ?? DEFAULT_DURATION_SECONDS;

  if (
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    throw new ConfigurationError(
      `Preview duration must be between 1 and ${MAX_DURATION_SECONDS} seconds.`,
    );
  }

  if (options.store !== undefined) {
    for (const method of ['create', 'read', 'delete'] as const) {
      if (typeof options.store[method] !== 'function') {
        throw new ConfigurationError(`Preview store must provide a ${method}() method.`);
      }
    }
  }

  return {
    secret: options.secret,
    durationSeconds,
    store: options.store ?? createMemoryPreviewStore(),
    resolvePath: options.resolvePath,
    instanceId: createHash('sha256')
      .update(
        `${options.secret}:${config.contentRoot}:${Object.keys(config.collections).sort().join(',')}`,
      )
      .digest('hex')
      .slice(0, 32),
  };
}

function createPreviewCookie(
  payload: PreviewCookiePayload,
  secret: string,
  durationSeconds: number,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPreviewCookie(encoded, secret);
  const secure = process.env.NODE_ENV === 'production';
  return [
    `${PREVIEW_COOKIE_NAME}=${encoded}.${signature}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${durationSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function clearPreviewCookie(): string {
  return `${PREVIEW_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

function readPreviewCookie(request: Request, secret: string): string | null {
  const value = parseCookie(request.headers.get('cookie') ?? '', PREVIEW_COOKIE_NAME);

  if (!value) {
    return null;
  }

  const [encoded, signature, ...rest] = value.split('.');

  if (
    !encoded ||
    !signature ||
    rest.length > 0 ||
    !safeSignatureEqual(signature, signPreviewCookie(encoded, secret))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;

    return isRecord(payload) && typeof payload.id === 'string' && isUuid(payload.id)
      ? payload.id
      : null;
  } catch {
    return null;
  }
}

function signPreviewCookie(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseCookie(value: string, name: string): string | null {
  for (const part of value.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=') || null;
    }
  }
  return null;
}

function validatePreviewPath(value: string | null): string {
  const hasControlCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });

  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PREVIEW_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('?') ||
    value.includes('#') ||
    hasControlCharacter
  ) {
    throw new ConfigurationError('Preview paths must be safe same-origin application paths.');
  }

  return value;
}

function pruneExpired(records: Map<string, PithPreviewRecord>): void {
  const now = Date.now();
  for (const [id, record] of records) {
    if (Date.parse(record.expiresAt) <= now) {
      records.delete(id);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicationKey(
  userId: string,
  publication: { readonly branch?: string; readonly reviewNumber?: number },
): string {
  return `${userId}:${publication.branch ?? ''}:${publication.reviewNumber ?? ''}`;
}

function isTrustedPublication(
  publications: ReadonlyMap<string, unknown>,
  userId: string,
  publication: { readonly branch?: string; readonly reviewNumber?: number },
): boolean {
  return publications.has(publicationKey(userId, publication));
}
