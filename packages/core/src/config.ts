import type { CollectionDefinition, EntryFormat } from './collection.js';
import { type AnyFieldDefinition, type FieldRecord } from './fields.js';
import { normalizeContentPath } from './path.js';
import { validateCollectionDefinition } from './schema.js';

import { ConfigurationError } from './errors.js';

export interface PithCollectionShape {
  readonly label?: string;
  readonly path: string;
  readonly format: EntryFormat;
  readonly identifierField: string;
  readonly displayField?: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface PithConfig<
  TCollections extends Readonly<Record<string, PithCollectionShape>> = CollectionRecord,
> {
  readonly contentRoot: string;
  readonly collections: TCollections;
}

export type CollectionRecord = Readonly<Record<string, PithCollectionShape>>;

const RESERVED_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export function definePith<TCollections extends CollectionRecord>(
  config: PithConfig<TCollections>,
): PithConfig<TCollections> {
  validatePithConfig(config);

  return Object.freeze({
    contentRoot: normalizeConfigPath(config.contentRoot, 'contentRoot'),
    collections: Object.freeze({ ...config.collections }),
  }) as PithConfig<TCollections>;
}

export function validatePithConfig(config: PithConfig): void {
  normalizeConfigPath(config.contentRoot, 'contentRoot');

  if (!isRecord(config.collections) || Object.keys(config.collections).length === 0) {
    throw new ConfigurationError('Pith requires at least one collection.');
  }

  const collectionPaths = new Map<string, string>();

  for (const [name, collection] of Object.entries(config.collections)) {
    assertPublicName(name, 'Collection');

    if (!collection || typeof collection !== 'object') {
      throw new ConfigurationError(`Collection "${name}" must be an object.`);
    }

    const normalizedPath = normalizeConfigPath(collection.path, `Collection "${name}" path`);
    const duplicate = collectionPaths.get(normalizedPath);

    if (duplicate) {
      throw new ConfigurationError(
        `Collections "${duplicate}" and "${name}" cannot share the path "${normalizedPath}".`,
      );
    }

    collectionPaths.set(normalizedPath, name);
    validateCollectionDefinition(name, collection as unknown as CollectionDefinition<FieldRecord>);
  }
}

function normalizeConfigPath(value: string, label: string): string {
  try {
    return normalizeContentPath(value, label);
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(error.message);
    }

    throw new ConfigurationError(`${label} is invalid.`);
  }
}

export function assertPublicName(name: string, kind: 'Collection' | 'Field'): void {
  if (name.trim().length === 0) {
    throw new ConfigurationError(`${kind} names must not be empty.`);
  }

  if (RESERVED_NAMES.has(name)) {
    throw new ConfigurationError(`${kind} name "${name}" is reserved.`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asFieldRecord(value: unknown): FieldRecord {
  if (!isRecord(value)) {
    throw new ConfigurationError('Field definitions must be an object.');
  }

  return value as Record<string, AnyFieldDefinition>;
}
