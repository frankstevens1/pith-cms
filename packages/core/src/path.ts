import type { CollectionDefinition } from './collection.js';
import type { PithConfig } from './config.js';

import { ConfigurationError, ContentPathError } from './errors.js';

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function normalizeContentPath(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContentPathError(`${label} must be a non-empty path.`);
  }

  const decoded = decodePath(value, label);
  const normalized = decoded.replace(/\\/g, '/');

  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    WINDOWS_ABSOLUTE_PATH.test(normalized)
  ) {
    throw new ContentPathError(`${label} must be a relative path.`, { metadata: { label } });
  }

  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ContentPathError(`${label} must not contain traversal segments.`, {
      metadata: { label },
    });
  }

  return segments.join('/');
}

export function normalizeIdentifier(identifier: string): string {
  if (typeof identifier !== 'string' || identifier.trim().length === 0) {
    throw new ContentPathError('Entry identifiers must be non-empty strings.');
  }

  const decoded = decodePath(identifier, 'Entry identifiers');

  if (
    decoded.includes('\0') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('.') ||
    WINDOWS_ABSOLUTE_PATH.test(decoded)
  ) {
    throw new ContentPathError(
      'Entry identifiers must not contain path separators, traversal segments, or file extensions.',
    );
  }

  return decoded;
}

export function getCollectionDirectory(
  config: PithConfig,
  collectionName: string,
): { collection: CollectionDefinition; directory: string } {
  const collection = config.collections[collectionName];

  if (!collection) {
    throw new ConfigurationError(`Unknown collection "${collectionName}".`, {
      metadata: { collection: collectionName },
    });
  }

  return {
    collection: collection as unknown as CollectionDefinition,
    directory: normalizeContentPath(
      `${normalizeContentPath(config.contentRoot, 'contentRoot')}/${normalizeContentPath(
        collection.path,
        `Collection "${collectionName}" path`,
      )}`,
      `Collection "${collectionName}" directory`,
    ),
  };
}

export function getEntryPath({
  config,
  collection,
  identifier,
}: {
  readonly config: PithConfig;
  readonly collection: string;
  readonly identifier: string;
}): string {
  const { collection: definition, directory } = getCollectionDirectory(config, collection);
  const extension =
    definition.format === 'json' ? 'json' : definition.format === 'markdown' ? 'md' : null;

  if (!extension) {
    throw new ContentPathError(`Collection "${collection}" has an unsupported entry format.`);
  }

  return `${directory}/${normalizeIdentifier(identifier)}.${extension}`;
}

export function getIdentifierFromEntryPath(
  directory: string,
  format: CollectionDefinition['format'],
  path: string,
): string {
  const normalizedDirectory = normalizeContentPath(directory, 'Collection directory');
  const normalizedPath = normalizeContentPath(path, 'Repository path');
  const extension = format === 'json' ? '.json' : '.md';
  const prefix = `${normalizedDirectory}/`;

  if (!normalizedPath.startsWith(prefix)) {
    throw new ContentPathError('Repository path is outside the requested collection directory.');
  }

  const fileName = normalizedPath.slice(prefix.length);

  if (fileName.includes('/') || !fileName.endsWith(extension)) {
    throw new ContentPathError(
      'Repository path is not a direct entry for the requested collection.',
    );
  }

  return normalizeIdentifier(fileName.slice(0, -extension.length));
}

function decodePath(value: string, label: string): string {
  let decoded = value;

  for (let index = 0; index < 3; index += 1) {
    if (!decoded.includes('%')) {
      return decoded;
    }

    try {
      const nextValue = decodeURIComponent(decoded);

      if (nextValue === decoded) {
        return decoded;
      }

      decoded = nextValue;
    } catch {
      throw new ContentPathError(`${label} contains an invalid encoded path sequence.`, {
        metadata: { label },
      });
    }
  }

  return decoded;
}
