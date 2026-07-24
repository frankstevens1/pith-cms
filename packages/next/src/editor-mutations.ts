import {
  ContentAlreadyExistsError,
  ContentValidationError,
  RepositoryConflictError,
  createContentService,
  getEntryPath,
  validateEntry,
} from '@pith-cms/core';
import type {
  CollectionDefinition,
  ContentEntry,
  FieldRecord,
  PithConfig,
  RepositoryPublication,
} from '@pith-cms/core';

import { AuthorizationError, RequestValidationError } from './editor-errors.js';
import type {
  CreateEditorDependencies,
  PithAuthorizedUser,
  PithEditorMutations,
  PithPermission,
} from './editor-types.js';

export function createEditorMutations<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
): PithEditorMutations<TConfig> {
  const content = createContentService({
    config: dependencies.config,
    repository: dependencies.repository,
  });

  return {
    async createEntry({ collection, identifier, value, user }) {
      assertPermission(user, 'content:create');
      const path = getEntryPath({ config: dependencies.config, collection, identifier });
      const existing = await dependencies.repository.read(path);

      if (existing) {
        throw new ContentAlreadyExistsError(undefined, {
          metadata: { collection, identifier, path },
        });
      }

      assertEntryValid(dependencies.config, collection, identifier, value);

      try {
        const entry = await content.writeEntry({
          collection,
          identifier,
          value,
          createOnly: true,
          message: `Create ${collection}: ${identifier}`,
        });
        await emitAuditEvent(
          dependencies,
          'create',
          user,
          collection,
          identifier,
          entry.publication,
        );
        await dependencies.onCanonicalMutation?.({
          operation: 'create',
          userId: user.id,
          collection,
          identifier,
          ...(entry.publication === undefined ? {} : { publication: entry.publication }),
        });
        return entry as ContentEntry<unknown>;
      } catch (error) {
        if (error instanceof RepositoryConflictError) {
          throw new ContentAlreadyExistsError(undefined, {
            metadata: { collection, identifier, path },
          });
        }

        throw error;
      }
    },

    async updateEntry({ collection, identifier, value, expectedRevision, user }) {
      assertPermission(user, 'content:update');
      assertRevision(expectedRevision);
      assertEntryValid(dependencies.config, collection, identifier, value);
      const entry = await content.writeEntry({
        collection,
        identifier,
        value,
        expectedRevision,
        message: `Update ${collection}: ${identifier}`,
      });
      await emitAuditEvent(dependencies, 'update', user, collection, identifier, entry.publication);
      await dependencies.onCanonicalMutation?.({
        operation: 'update',
        userId: user.id,
        collection,
        identifier,
        ...(entry.publication === undefined ? {} : { publication: entry.publication }),
      });
      return entry as ContentEntry<unknown>;
    },

    async deleteEntry({ collection, identifier, expectedRevision, user }) {
      assertPermission(user, 'content:delete');
      assertRevision(expectedRevision);
      const result = await content.deleteEntry({
        collection,
        identifier,
        expectedRevision,
        message: `Delete ${collection}: ${identifier}`,
      });
      await emitAuditEvent(
        dependencies,
        'delete',
        user,
        collection,
        identifier,
        result.publication,
      );
      await dependencies.onCanonicalMutation?.({
        operation: 'delete',
        userId: user.id,
        collection,
        identifier,
        ...(result.publication === undefined ? {} : { publication: result.publication }),
      });
      return result;
    },
  };
}

function assertEntryValid<TConfig extends PithConfig>(
  config: TConfig,
  collectionName: Extract<keyof TConfig['collections'], string>,
  identifier: string,
  value: unknown,
): void {
  const collection = config.collections[collectionName];

  if (!collection) {
    throw new RequestValidationError('The requested collection does not exist.');
  }

  const result = validateEntry({
    collection: collection as unknown as CollectionDefinition<FieldRecord>,
    value,
  });

  if (!result.success) {
    throw new ContentValidationError('Content failed validation.', result.errors);
  }

  if (!isRecord(result.data) || result.data[collection.identifierField] !== identifier) {
    throw new ContentValidationError(
      'The entry identifier must match its configured identifier field.',
      [
        {
          code: 'identifier_mismatch',
          path: [collection.identifierField],
          message: `The ${collection.identifierField} field must match the entry identifier.`,
        },
      ],
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRevision(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestValidationError('A current content revision is required.');
  }
}

function assertPermission(user: PithAuthorizedUser, permission: PithPermission): void {
  if (!user.permissions.includes(permission)) {
    throw new AuthorizationError();
  }
}

async function emitAuditEvent<TConfig extends PithConfig>(
  dependencies: CreateEditorDependencies<TConfig>,
  operation: 'create' | 'update' | 'delete',
  user: PithAuthorizedUser,
  collection: string,
  identifier: string,
  publication: RepositoryPublication | undefined,
): Promise<void> {
  try {
    await dependencies.options.onAuditEvent?.({
      operation,
      userId: user.id,
      collection,
      identifier,
      occurredAt: new Date().toISOString(),
      ...(publication === undefined ? {} : { publication }),
    });
  } catch {
    // Auditing is observational in v1. A completed repository mutation is not rolled back.
  }
}
