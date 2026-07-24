import { cache as reactCache } from 'react';
import { revalidateTag, unstable_cache } from 'next/cache';

import {
  ConfigurationError,
  ContentNotFoundError,
  createContentService,
  getCollectionDirectory,
  getEntryPath,
  getIdentifierFromEntryPath,
  validatePithConfig,
} from '@pith-cms/core';
import type { ContentEntry, ContentRepository, PithConfig } from '@pith-cms/core';

import { createEditor } from './editor.js';
import { createPithPreview, createPreviewAwareContentClient } from './preview.js';
import type {
  CollectionMetadata,
  ConfiguredCollectionName,
  CreatePithOptions,
  PithCacheMode,
  PithCacheOptions,
  PithCache,
  PithContentClient,
  PithInstanceWithEditor,
  PithInstance,
  PithListEntriesResult,
  InferConfiguredCollectionEntry,
  ListEntriesOptions,
} from './types.js';
import type { PithAuthAdapter, PithEditorOptions } from './editor-types.js';

interface ResolvedCacheOptions {
  readonly mode: PithCacheMode;
  readonly revalidate: number | false;
  readonly tagPrefix: string;
}

interface UncachedContentClient<TConfig extends PithConfig> {
  getEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
  ): Promise<ContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>>>;
  getOptionalEntry<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    identifier: string,
  ): Promise<ContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>> | null>;
  listEntries<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
    includeInvalid: boolean,
  ): Promise<PithListEntriesResult<InferConfiguredCollectionEntry<TConfig, TCollectionName>>>;
  getEntryIdentifiers<TCollectionName extends ConfiguredCollectionName<TConfig>>(
    collection: TCollectionName,
  ): Promise<readonly string[]>;
}

export function createPith<TConfig extends PithConfig>(
  options: CreatePithOptions<TConfig> & {
    readonly editor: PithEditorOptions;
    readonly auth: PithAuthAdapter;
  },
): PithInstanceWithEditor<TConfig>;
export function createPith<TConfig extends PithConfig>(
  options: CreatePithOptions<TConfig>,
): PithInstance<TConfig>;
export function createPith<TConfig extends PithConfig>(
  options: CreatePithOptions<TConfig>,
): PithInstance<TConfig> {
  assertNodeRuntime();
  validateCreatePithOptions(options);

  const cacheOptions = resolveCacheOptions(options.cache);
  const contentService = createContentService({
    config: options.config,
    repository: options.repository,
  });
  const uncached = createUncachedContentClient(options.config, options.repository, contentService);
  const cachedGetEntry = reactCache(uncached.getEntry);
  const cachedGetOptionalEntry = reactCache(uncached.getOptionalEntry);
  const cachedListEntries = reactCache(uncached.listEntries);
  const cachedGetEntryIdentifiers = reactCache(uncached.getEntryIdentifiers);
  const cache = createCache(options.config, cacheOptions);
  const preview =
    options.preview && options.auth
      ? createPithPreview({
          config: options.config,
          repository: options.repository,
          auth: options.auth,
          options: options.preview,
        })
      : undefined;

  const content: PithContentClient<TConfig> = {
    getEntry(collection, identifier) {
      return cacheOptions.mode === 'request'
        ? cachedGetEntry(collection, identifier)
        : cacheOptions.mode === 'persistent'
          ? unstable_cache(
              () => uncached.getEntry(collection, identifier),
              [cacheOptions.tagPrefix, 'entry', collection, identifier],
              {
                tags: cache.tagsForEntry(collection, identifier),
                revalidate: cacheOptions.revalidate,
              },
            )()
          : uncached.getEntry(collection, identifier);
    },

    getOptionalEntry(collection, identifier) {
      return cacheOptions.mode === 'request'
        ? cachedGetOptionalEntry(collection, identifier)
        : cacheOptions.mode === 'persistent'
          ? unstable_cache(
              () => uncached.getOptionalEntry(collection, identifier),
              [cacheOptions.tagPrefix, 'optional-entry', collection, identifier],
              {
                tags: cache.tagsForEntry(collection, identifier),
                revalidate: cacheOptions.revalidate,
              },
            )()
          : uncached.getOptionalEntry(collection, identifier);
    },

    listEntries(collection, listOptions?: ListEntriesOptions) {
      const includeInvalid = listOptions?.includeInvalid !== false;

      return cacheOptions.mode === 'request'
        ? cachedListEntries(collection, includeInvalid)
        : cacheOptions.mode === 'persistent'
          ? unstable_cache(
              () => uncached.listEntries(collection, includeInvalid),
              [cacheOptions.tagPrefix, 'collection', collection, String(includeInvalid)],
              {
                tags: cache.tagsForCollection(collection),
                revalidate: cacheOptions.revalidate,
              },
            )()
          : uncached.listEntries(collection, includeInvalid);
    },

    getCollection(collection) {
      return getCollectionMetadata(options.config, collection);
    },

    async hasEntry(collection, identifier) {
      return (await content.getOptionalEntry(collection, identifier)) !== null;
    },

    getEntryIdentifiers(collection) {
      return cacheOptions.mode === 'request'
        ? cachedGetEntryIdentifiers(collection)
        : cacheOptions.mode === 'persistent'
          ? unstable_cache(
              () => uncached.getEntryIdentifiers(collection),
              [cacheOptions.tagPrefix, 'identifiers', collection],
              {
                tags: cache.tagsForCollection(collection),
                revalidate: cacheOptions.revalidate,
              },
            )()
          : uncached.getEntryIdentifiers(collection);
    },

    forRequest() {
      return createPreviewAwareContentClient({
        config: options.config,
        repository: options.repository,
        canonical: content,
        ...(preview === undefined ? {} : { preview }),
      });
    },
  };

  const editor =
    options.editor && options.auth
      ? createEditor({
          config: options.config,
          repository: options.repository,
          options: options.editor,
          auth: options.auth,
          ...(preview === undefined ? {} : { preview }),
          onCanonicalMutation: async ({
            collection,
            identifier,
            operation,
            userId,
            publication,
          }) => {
            if (publication) {
              preview?.registerPublication({ userId, publication });
            }
            if (publication?.mode === 'pull-request') {
              return;
            }
            if (operation === 'create' || operation === 'update' || operation === 'delete') {
              await cache.public.revalidateEntry(collection, identifier);
              await cache.public.revalidateCollection(collection);
            }
          },
          onPublicationMerged: async ({ collection, identifier }) => {
            await cache.public.revalidateEntry(collection, identifier);
            await cache.public.revalidateCollection(collection);
          },
        })
      : undefined;

  return Object.freeze({
    config: options.config,
    content: Object.freeze(content),
    cache: Object.freeze(cache.public),
    ...(preview === undefined ? {} : { preview }),
    ...(editor === undefined ? {} : { editor }),
  });
}

export function getPithRootTag(prefix = 'pith'): string {
  return normalizeTagSegment(prefix, 'Tag prefix');
}

export function getPithCollectionTag(collection: string, prefix = 'pith'): string {
  return `${getPithRootTag(prefix)}:collection:${normalizeTagSegment(collection, 'Collection')}`;
}

export function getPithEntryTag(collection: string, identifier: string, prefix = 'pith'): string {
  return `${getPithRootTag(prefix)}:entry:${normalizeTagSegment(collection, 'Collection')}:${normalizeTagSegment(
    identifier,
    'Entry identifier',
  )}`;
}

function createUncachedContentClient<TConfig extends PithConfig>(
  config: TConfig,
  repository: ContentRepository,
  contentService: ReturnType<typeof createContentService<TConfig>>,
): UncachedContentClient<TConfig> {
  return {
    async getEntry(collection, identifier) {
      const path = getEntryPath({ config, collection, identifier });
      const entry = await contentService.getEntry(collection, identifier);

      if (entry) {
        return entry as ContentEntry<InferConfiguredCollectionEntry<TConfig, typeof collection>>;
      }

      throw new ContentNotFoundError(undefined, {
        metadata: { collection, identifier, path },
      });
    },

    async getOptionalEntry(collection, identifier) {
      const entry = await contentService.getEntry(collection, identifier);

      return entry as ContentEntry<
        InferConfiguredCollectionEntry<TConfig, typeof collection>
      > | null;
    },

    async listEntries(collection, includeInvalid) {
      const result = await contentService.listEntries(collection);

      return {
        entries: result.entries as readonly ContentEntry<
          InferConfiguredCollectionEntry<TConfig, typeof collection>
        >[],
        invalidEntries: includeInvalid ? result.invalidEntries : [],
      };
    },

    async getEntryIdentifiers(collection) {
      const { collection: definition, directory } = getCollectionDirectory(config, collection);
      const extension = definition.format === 'json' ? '.json' : '.md';
      const files = await repository.list(directory);
      const identifiers = files
        .filter((file) => file.path.endsWith(extension))
        .map((file) => getIdentifierFromEntryPath(directory, definition.format, file.path));

      return identifiers.sort(compareStrings);
    },
  };
}

function getCollectionMetadata<TConfig extends PithConfig>(
  config: TConfig,
  collectionName: ConfiguredCollectionName<TConfig>,
): CollectionMetadata {
  const { collection } = getCollectionDirectory(config, collectionName);

  return Object.freeze({
    name: collectionName,
    label: collection.label ?? collectionName,
    path: collection.path,
    format: collection.format,
    identifierField: collection.identifierField,
    ...(collection.displayField === undefined ? {} : { displayField: collection.displayField }),
  });
}

function validateCreatePithOptions<TConfig extends PithConfig>(
  options: CreatePithOptions<TConfig>,
): void {
  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('createPith requires an options object.');
  }

  if (!options.config || typeof options.config !== 'object') {
    throw new ConfigurationError('createPith requires a Pith configuration.');
  }

  validatePithConfig(options.config);
  assertRepository(options.repository);
  resolveCacheOptions(options.cache);

  if ((options.editor || options.preview) && !options.auth) {
    throw new ConfigurationError('Editor configuration requires an authentication adapter.');
  }

  if (!options.editor && options.auth) {
    throw new ConfigurationError('Authentication configuration requires editor configuration.');
  }

  if (options.preview && !options.editor) {
    throw new ConfigurationError('Preview configuration requires the protected Pith editor.');
  }
}

function assertRepository(repository: ContentRepository): void {
  if (!repository || typeof repository !== 'object') {
    throw new ConfigurationError('createPith requires a ContentRepository.');
  }

  for (const method of ['read', 'list', 'write', 'delete'] as const) {
    if (typeof repository[method] !== 'function') {
      throw new ConfigurationError(`ContentRepository must provide a ${method}() method.`);
    }
  }
}

function resolveCacheOptions(options: PithCacheOptions | undefined): ResolvedCacheOptions {
  if (options === undefined) {
    return { mode: 'request', revalidate: false, tagPrefix: 'pith' };
  }

  if (!options || typeof options !== 'object') {
    throw new ConfigurationError('Pith cache options must be an object.');
  }

  const keys = Object.keys(options);

  if (keys.some((key) => !['mode', 'revalidate', 'tagPrefix'].includes(key))) {
    throw new ConfigurationError('Pith cache contains an unsupported option.');
  }

  const mode = options.mode ?? 'request';

  if (mode !== 'no-store' && mode !== 'request' && mode !== 'persistent') {
    throw new ConfigurationError('Pith cache mode must be "no-store", "request", or "persistent".');
  }

  const revalidate = options.revalidate ?? 300;
  if (!Number.isSafeInteger(revalidate) || revalidate <= 0) {
    throw new ConfigurationError(
      'Pith cache revalidate must be a positive whole number of seconds.',
    );
  }
  const tagPrefix = options.tagPrefix ?? 'pith';
  normalizeTagSegment(tagPrefix, 'Tag prefix');

  return Object.freeze({ mode, revalidate: mode === 'persistent' ? revalidate : false, tagPrefix });
}

function createCache<TConfig extends PithConfig>(
  config: TConfig,
  options: ResolvedCacheOptions,
): {
  readonly public: PithCache;
  tagsForEntry(collection: string, identifier: string): string[];
  tagsForCollection(collection: string): string[];
} {
  function assertCollection(collection: string): void {
    if (!config.collections[collection]) {
      throw new ConfigurationError(`Unknown collection "${collection}".`);
    }
  }

  function tagsForCollection(collection: string): string[] {
    assertCollection(collection);
    return [getPithRootTag(options.tagPrefix), getPithCollectionTag(collection, options.tagPrefix)];
  }

  function tagsForEntry(collection: string, identifier: string): string[] {
    assertCollection(collection);
    getEntryPath({ config, collection, identifier });
    return [
      ...tagsForCollection(collection),
      getPithEntryTag(collection, identifier, options.tagPrefix),
    ];
  }

  async function revalidate(tags: readonly string[]): Promise<void> {
    if (options.mode !== 'persistent') {
      return;
    }

    for (const tag of tags) {
      // Canonical editor mutations must be visible on the next request. The
      // "max" profile permits stale-while-revalidate reads, which can briefly
      // show the pre-mutation entry after a successful save.
      revalidateTag(tag, { expire: 0 });
    }
  }

  return {
    tagsForEntry,
    tagsForCollection,
    public: {
      async revalidateEntry(collection, identifier) {
        await revalidate(tagsForEntry(collection, identifier));
      },
      async revalidateCollection(collection) {
        await revalidate(tagsForCollection(collection));
      },
      async revalidateAll() {
        await revalidate([getPithRootTag(options.tagPrefix)]);
      },
    },
  };
}

function assertNodeRuntime(): void {
  if (typeof process === 'undefined' || process.release?.name !== 'node') {
    throw new ConfigurationError(
      'The Pith Next.js integration currently requires the Node.js runtime.',
    );
  }
}

function normalizeTagSegment(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || /[:\s/\\]/.test(value)) {
    throw new ConfigurationError(`${label} must be a non-empty tag segment.`);
  }

  return value;
}

function compareStrings(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
