import type { CollectionDefinition, InferCollectionEntry } from './collection.js';
import type { PithConfig } from './config.js';
import {
  ContentParseError,
  ContentPathError,
  ContentValidationError,
  PithError,
  RepositoryError,
  RepositoryNotFoundError,
} from './errors.js';
import { getCollectionDirectory, getEntryPath, getIdentifierFromEntryPath } from './path.js';
import type {
  ContentRepository,
  DeleteFileResult,
  RepositoryFile,
  RepositoryFileSummary,
  RepositoryPublication,
  WriteFileResult,
} from './repository.js';
import { parseEntry, serializeEntry } from './serialization.js';
import { type ValidationResult, validateEntry } from './validation.js';

type CollectionName<TConfig extends PithConfig> = Extract<keyof TConfig['collections'], string>;
type CollectionFor<
  TConfig extends PithConfig,
  TName extends CollectionName<TConfig>,
> = TConfig['collections'][TName] extends CollectionDefinition
  ? TConfig['collections'][TName]
  : never;
type EntryFor<
  TConfig extends PithConfig,
  TName extends CollectionName<TConfig>,
> = InferCollectionEntry<CollectionFor<TConfig, TName>>;

export interface ContentEntry<TValue> {
  readonly collection: string;
  readonly identifier: string;
  readonly path: string;
  readonly value: TValue;
  readonly revision: string;
  readonly updatedAt?: string;
  readonly publication?: RepositoryPublication;
}

export interface InvalidContentEntry {
  readonly path: string;
  readonly identifier?: string;
  readonly error: ContentParseError | ContentPathError | ContentValidationError | RepositoryError;
}

export interface ListEntriesResult<TValue> {
  readonly entries: readonly ContentEntry<TValue>[];
  readonly invalidEntries: readonly InvalidContentEntry[];
}

export interface ContentService<TConfig extends PithConfig = PithConfig> {
  getEntry<TName extends CollectionName<TConfig>>(
    collectionName: TName,
    identifier: string,
  ): Promise<ContentEntry<EntryFor<TConfig, TName>> | null>;
  listEntries<TName extends CollectionName<TConfig>>(
    collectionName: TName,
  ): Promise<ListEntriesResult<EntryFor<TConfig, TName>>>;
  validateEntry<TName extends CollectionName<TConfig>>(
    collectionName: TName,
    value: unknown,
  ): ValidationResult<EntryFor<TConfig, TName>>;
  serializeEntry<TName extends CollectionName<TConfig>>(
    collectionName: TName,
    value: unknown,
  ): string;
  writeEntry<TName extends CollectionName<TConfig>>(input: {
    readonly collection: TName;
    readonly identifier: string;
    readonly value: unknown;
    readonly expectedRevision?: string;
    readonly createOnly?: boolean;
    readonly message: string;
  }): Promise<ContentEntry<EntryFor<TConfig, TName>>>;
  deleteEntry<TName extends CollectionName<TConfig>>(input: {
    readonly collection: TName;
    readonly identifier: string;
    readonly expectedRevision?: string;
    readonly message: string;
  }): Promise<DeleteFileResult>;
}

export function createContentService<TConfig extends PithConfig>({
  config,
  repository,
}: {
  readonly config: TConfig;
  readonly repository: ContentRepository;
}): ContentService<TConfig> {
  const service: ContentService<TConfig> = {
    async getEntry(collectionName, identifier) {
      const collection = resolveCollection(config, collectionName);
      const path = getEntryPath({ config, collection: collectionName, identifier });
      const file = await runRepositoryOperation(() => repository.read(path));

      if (!file) {
        return null;
      }

      return parseRepositoryFile(collectionName, identifier, collection, file);
    },

    async listEntries(collectionName) {
      const collection = resolveCollection(config, collectionName);
      const { directory } = getCollectionDirectory(config, collectionName);
      const files = await runRepositoryOperation(() => repository.list(directory));
      const entries: ContentEntry<EntryFor<TConfig, typeof collectionName>>[] = [];
      const invalidEntries: InvalidContentEntry[] = [];
      const extension = collection.format === 'json' ? '.json' : '.md';

      for (const file of [...files]
        .filter((file) => file.path.endsWith(extension))
        .sort(comparePaths)) {
        try {
          const identifier = getIdentifierFromEntryPath(directory, collection.format, file.path);
          const repositoryFile = await runRepositoryOperation(() => repository.read(file.path));

          if (!repositoryFile) {
            throw new RepositoryNotFoundError(
              'A repository file disappeared while listing content.',
            );
          }

          entries.push(
            parseRepositoryFile(
              collectionName,
              identifier,
              collection,
              repositoryFile,
            ) as ContentEntry<EntryFor<TConfig, typeof collectionName>>,
          );
        } catch (error) {
          invalidEntries.push({
            path: file.path,
            error: toListError(error),
          });
        }
      }

      return { entries, invalidEntries };
    },

    validateEntry(collectionName, value) {
      return validateEntry({ collection: resolveCollection(config, collectionName), value });
    },

    serializeEntry(collectionName, value) {
      return serializeEntry(resolveCollection(config, collectionName), value);
    },

    async writeEntry({
      collection: collectionName,
      identifier,
      value,
      expectedRevision,
      createOnly,
      message,
    }) {
      const collection = resolveCollection(config, collectionName);
      const path = getEntryPath({ config, collection: collectionName, identifier });
      const validation = validateEntry({ collection, value });

      if (!validation.success) {
        throw new ContentValidationError(
          'Content failed validation before writing.',
          validation.errors,
        );
      }

      const result = await runRepositoryOperation(() =>
        repository.write({
          path,
          content: serializeEntry(collection, validation.data),
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
          ...(createOnly === true ? { createOnly: true } : {}),
          message,
        }),
      );

      return toContentEntry(collectionName, identifier, result, validation.data);
    },

    async deleteEntry({ collection: collectionName, identifier, expectedRevision, message }) {
      const path = getEntryPath({ config, collection: collectionName, identifier });

      return runRepositoryOperation(() =>
        repository.delete(
          expectedRevision === undefined ? { path, message } : { path, expectedRevision, message },
        ),
      );
    },
  };

  return service;
}

function resolveCollection<TConfig extends PithConfig, TName extends CollectionName<TConfig>>(
  config: TConfig,
  collectionName: TName,
): CollectionFor<TConfig, TName> {
  const collection = config.collections[collectionName];

  if (!collection) {
    throw new RepositoryError(`Unknown collection "${collectionName}".`);
  }

  return collection as CollectionFor<TConfig, TName>;
}

function parseRepositoryFile<TCollection extends CollectionDefinition>(
  collectionName: string,
  identifier: string,
  collection: TCollection,
  file: RepositoryFile,
): ContentEntry<InferCollectionEntry<TCollection>> {
  const result = parseEntry(collection, file.content);

  if (!result.success) {
    throw result.error;
  }

  return {
    collection: collectionName,
    identifier,
    path: file.path,
    value: result.data,
    revision: file.revision,
    ...(file.updatedAt === undefined ? {} : { updatedAt: file.updatedAt }),
  };
}

function toContentEntry<TValue>(
  collection: string,
  identifier: string,
  result: WriteFileResult,
  value: TValue,
): ContentEntry<TValue> {
  return {
    collection,
    identifier,
    path: result.path,
    value,
    revision: result.revision,
    ...(result.publication === undefined ? {} : { publication: result.publication }),
  };
}

async function runRepositoryOperation<TValue>(operation: () => Promise<TValue>): Promise<TValue> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PithError) {
      throw error;
    }

    throw new RepositoryError('The content repository operation failed.');
  }
}

function toListError(
  error: unknown,
): ContentParseError | ContentPathError | ContentValidationError | RepositoryError {
  if (
    error instanceof ContentParseError ||
    error instanceof ContentPathError ||
    error instanceof ContentValidationError ||
    error instanceof RepositoryError
  ) {
    return error;
  }

  return new RepositoryError('The content repository operation failed.');
}

function comparePaths(left: RepositoryFileSummary, right: RepositoryFileSummary): number {
  return left.path === right.path ? 0 : left.path < right.path ? -1 : 1;
}
