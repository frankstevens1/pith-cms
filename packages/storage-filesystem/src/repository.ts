import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

import {
  ConfigurationError,
  ContentPathError,
  PithError,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from '@pith-cms/core';
import type {
  ContentRepository,
  DeleteFileInput,
  DeleteFileResult,
  RepositoryFileSummary,
  WriteFileInput,
  WriteFileResult,
} from '@pith-cms/core';

const TEMPORARY_FILE_PREFIX = '.pith-tmp-';
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export interface FilesystemRepositoryOptions {
  /** An existing directory that contains every logical repository path. */
  readonly rootDirectory: string;
  /** Pith v1 stores opaque text as UTF-8 only. */
  readonly encoding?: 'utf8';
}

interface RepositoryRoot {
  readonly realDirectory: string;
}

interface ResolvedRepositoryPath {
  readonly logicalPath: string;
  readonly nativePath: string;
  readonly segments: readonly string[];
}

interface ExistingFile {
  readonly nativePath: string;
  readonly mode: number;
  readonly updatedAt: string;
}

interface ExistingFileContent extends ExistingFile {
  readonly bytes: Buffer;
  readonly revision: string;
}

/**
 * Creates a Node.js-only repository rooted at an existing directory.
 *
 * The adapter intentionally accepts and returns only logical forward-slash
 * paths. It rejects symlink-backed paths rather than attempting to follow
 * them, which keeps the root-containment rule straightforward and portable.
 */
export function createFilesystemRepository(
  options: FilesystemRepositoryOptions,
): ContentRepository {
  const root = initializeRoot(options);
  const pathLocks = new Map<string, Promise<void>>();

  return {
    async read(path) {
      try {
        const resolved = resolveRepositoryPath(root, path, false);
        const file = await readExistingFile(root, resolved, 'read');

        if (!file) {
          return null;
        }

        return {
          path: resolved.logicalPath,
          content: file.bytes.toString('utf8'),
          revision: file.revision,
          updatedAt: file.updatedAt,
        };
      } catch (error) {
        throw normalizeFilesystemError('read', path, error);
      }
    },

    async list(directory) {
      try {
        const resolved = resolveRepositoryPath(root, directory, true);
        const nativeDirectory = await inspectExistingDirectory(root, resolved);

        if (!nativeDirectory) {
          return [];
        }

        const entries = await readdir(nativeDirectory, { withFileTypes: true });
        const files: RepositoryFileSummary[] = [];

        for (const entry of entries) {
          if (isPithTemporaryFile(entry.name)) {
            continue;
          }

          const entryPath = join(nativeDirectory, entry.name);
          const stat = await lstat(entryPath);

          if (stat.isSymbolicLink()) {
            throw unsafePathError(
              directory,
              'Repository listings must not contain symbolic links.',
            );
          }

          if (!stat.isFile()) {
            continue;
          }

          await assertRealPathWithinRoot(root, entryPath, directory);
          const bytes = await readFile(entryPath);
          const logicalPath = resolved.logicalPath
            ? `${resolved.logicalPath}/${entry.name}`
            : entry.name;

          files.push({
            path: logicalPath,
            revision: revisionFor(bytes),
            updatedAt: stat.mtime.toISOString(),
          });
        }

        return files.sort((left, right) =>
          left.path === right.path ? 0 : left.path < right.path ? -1 : 1,
        );
      } catch (error) {
        throw normalizeFilesystemError('list', directory, error);
      }
    },

    async write(input) {
      try {
        const resolved = resolveRepositoryPath(root, input.path, false);
        return await withPathLock(pathLocks, resolved.logicalPath, () =>
          writeRepositoryFile(root, input, resolved),
        );
      } catch (error) {
        throw normalizeFilesystemError('write', input.path, error);
      }
    },

    async delete(input) {
      try {
        const resolved = resolveRepositoryPath(root, input.path, false);
        return await withPathLock(pathLocks, resolved.logicalPath, () =>
          deleteRepositoryFile(root, input, resolved),
        );
      } catch (error) {
        throw normalizeFilesystemError('delete', input.path, error);
      }
    },
  };
}

function initializeRoot(options: FilesystemRepositoryOptions): RepositoryRoot {
  if (
    !options ||
    typeof options.rootDirectory !== 'string' ||
    options.rootDirectory.trim() === ''
  ) {
    throw new ConfigurationError('Filesystem repository rootDirectory must be a non-empty string.');
  }

  if (options.encoding !== undefined && options.encoding !== 'utf8') {
    throw new ConfigurationError('Filesystem repository only supports UTF-8 content.');
  }

  const absoluteDirectory = resolve(options.rootDirectory);

  try {
    const stat = lstatSync(absoluteDirectory);

    if (!stat.isDirectory()) {
      throw new ConfigurationError('Filesystem repository rootDirectory must be a directory.');
    }

    return { realDirectory: realpathSync(absoluteDirectory) };
  } catch (error) {
    if (error instanceof PithError) {
      throw error;
    }

    throw new ConfigurationError(
      'Filesystem repository rootDirectory must exist and be accessible.',
      {
        cause: error,
      },
    );
  }
}

function resolveRepositoryPath(
  root: RepositoryRoot,
  input: string,
  allowRoot: boolean,
): ResolvedRepositoryPath {
  const segments = normalizeLogicalPath(input, allowRoot);
  const logicalPath = segments.join('/');
  const nativePath = resolve(root.realDirectory, ...segments);
  const pathFromRoot = relative(root.realDirectory, nativePath);

  if (
    (!allowRoot && pathFromRoot.length === 0) ||
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw unsafePathError(input, 'Repository paths must remain inside the configured root.');
  }

  return { logicalPath, nativePath, segments };
}

function normalizeLogicalPath(input: string, allowRoot: boolean): readonly string[] {
  if (typeof input !== 'string') {
    throw unsafePathError('', 'Repository paths must be strings.');
  }

  const decoded = decodePath(input);

  if (
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.toLowerCase().startsWith('file:') ||
    decoded.startsWith('/') ||
    isAbsolute(decoded) ||
    win32.isAbsolute(decoded)
  ) {
    throw unsafePathError(input, 'Repository paths must be relative logical paths.');
  }

  const rawSegments = decoded.split('/');

  if (rawSegments.some((segment) => segment === '.' || segment === '..')) {
    throw unsafePathError(input, 'Repository paths must not contain traversal segments.');
  }

  const segments = rawSegments.filter(Boolean);

  if (!allowRoot && segments.length === 0) {
    throw unsafePathError(input, 'Repository file paths must not be empty.');
  }

  for (const segment of segments) {
    if (
      segment !== segment.trim() ||
      /[<>:"|?*]/.test(segment) ||
      WINDOWS_RESERVED_NAME.test(segment) ||
      segment.endsWith('.') ||
      segment.endsWith(' ')
    ) {
      throw unsafePathError(
        input,
        'Repository paths contain an unsupported platform-specific segment.',
      );
    }
  }

  return segments;
}

function decodePath(input: string): string {
  let decoded = input;

  for (let index = 0; index < 3; index += 1) {
    if (!decoded.includes('%')) {
      return decoded;
    }

    try {
      const next = decodeURIComponent(decoded);

      if (next === decoded) {
        return decoded;
      }

      decoded = next;
    } catch {
      throw unsafePathError(input, 'Repository paths contain an invalid encoded sequence.');
    }
  }

  return decoded;
}

async function inspectExistingDirectory(
  root: RepositoryRoot,
  resolved: ResolvedRepositoryPath,
): Promise<string | null> {
  let currentPath = root.realDirectory;

  for (const segment of resolved.segments) {
    currentPath = join(currentPath, segment);
    const stat = await lstatOrNull(currentPath);

    if (!stat) {
      return null;
    }

    assertNotSymbolicLink(stat.isSymbolicLink(), resolved.logicalPath);

    if (!stat.isDirectory()) {
      throw repositoryOperationError(
        'list',
        resolved.logicalPath,
        'Repository listing paths must resolve to directories.',
      );
    }

    await assertRealPathWithinRoot(root, currentPath, resolved.logicalPath);
  }

  return currentPath;
}

async function inspectExistingFile(
  root: RepositoryRoot,
  resolved: ResolvedRepositoryPath,
  operation: 'read' | 'write' | 'delete',
): Promise<ExistingFile | null> {
  let currentPath = root.realDirectory;

  for (const [index, segment] of resolved.segments.entries()) {
    currentPath = join(currentPath, segment);
    const stat = await lstatOrNull(currentPath);

    if (!stat) {
      return null;
    }

    assertNotSymbolicLink(stat.isSymbolicLink(), resolved.logicalPath);
    const isTarget = index === resolved.segments.length - 1;

    if (!isTarget) {
      if (!stat.isDirectory()) {
        throw repositoryOperationError(
          operation,
          resolved.logicalPath,
          'Repository file paths must not pass through regular files.',
        );
      }

      await assertRealPathWithinRoot(root, currentPath, resolved.logicalPath);
      continue;
    }

    if (!stat.isFile()) {
      throw repositoryOperationError(
        operation,
        resolved.logicalPath,
        'Repository file operations require a regular file.',
      );
    }

    await assertRealPathWithinRoot(root, currentPath, resolved.logicalPath);
    return {
      nativePath: currentPath,
      mode: stat.mode,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  throw unsafePathError(
    resolved.logicalPath,
    'Repository file paths must not resolve to the root.',
  );
}

async function ensureSafeParentDirectory(
  root: RepositoryRoot,
  resolved: ResolvedRepositoryPath,
): Promise<string> {
  let currentPath = root.realDirectory;

  for (const segment of resolved.segments.slice(0, -1)) {
    currentPath = join(currentPath, segment);
    let stat = await lstatOrNull(currentPath);

    if (!stat) {
      try {
        await mkdir(currentPath, { mode: 0o755 });
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) {
          throw error;
        }
      }

      stat = await lstatOrNull(currentPath);

      if (!stat) {
        throw repositoryOperationError(
          'write',
          resolved.logicalPath,
          'A parent directory disappeared while preparing a write.',
        );
      }
    }

    assertNotSymbolicLink(stat.isSymbolicLink(), resolved.logicalPath);

    if (!stat.isDirectory()) {
      throw repositoryOperationError(
        'write',
        resolved.logicalPath,
        'Repository file paths must not pass through regular files.',
      );
    }

    await assertRealPathWithinRoot(root, currentPath, resolved.logicalPath);
  }

  return currentPath;
}

async function readExistingFile(
  root: RepositoryRoot,
  resolved: ResolvedRepositoryPath,
  operation: 'read' | 'write' | 'delete',
): Promise<ExistingFileContent | null> {
  const file = await inspectExistingFile(root, resolved, operation);

  if (!file) {
    return null;
  }

  try {
    const bytes = await readFile(file.nativePath);

    return {
      ...file,
      bytes,
      revision: revisionFor(bytes),
    };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null;
    }

    throw error;
  }
}

async function writeRepositoryFile(
  root: RepositoryRoot,
  input: WriteFileInput,
  resolved: ResolvedRepositoryPath,
): Promise<WriteFileResult> {
  if (typeof input.content !== 'string') {
    throw repositoryOperationError(
      'write',
      input.path,
      'Repository content must be a UTF-8 string.',
    );
  }

  const parentDirectory = await ensureSafeParentDirectory(root, resolved);
  const initial = await readExistingFile(root, resolved, 'write');

  if (input.createOnly === true && initial) {
    throw new RepositoryConflictError('A repository file already exists at this path.', {
      metadata: {
        operation: 'write',
        path: resolved.logicalPath,
        actualRevision: initial.revision,
      },
    });
  }

  assertExpectedRevision('write', resolved.logicalPath, input.expectedRevision, initial?.revision);

  const temporaryPath = join(parentDirectory, `${TEMPORARY_FILE_PREFIX}${randomUUID()}`);
  const mode = initial ? initial.mode & 0o777 : 0o600;
  let renamed = false;

  try {
    const handle = await open(temporaryPath, 'wx', mode);

    try {
      await handle.writeFile(input.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Re-read immediately before replacement to reduce the revision-check race window.
    const latest = await readExistingFile(root, resolved, 'write');

    if (input.createOnly === true && latest) {
      throw new RepositoryConflictError('A repository file already exists at this path.', {
        metadata: {
          operation: 'write',
          path: resolved.logicalPath,
          actualRevision: latest.revision,
        },
      });
    }

    assertExpectedRevision('write', resolved.logicalPath, input.expectedRevision, latest?.revision);
    await ensureSafeParentDirectory(root, resolved);
    await rename(temporaryPath, resolved.nativePath);
    renamed = true;
  } finally {
    if (!renamed) {
      await removeTemporaryFile(temporaryPath);
    }
  }

  const written = await readExistingFile(root, resolved, 'write');

  if (!written) {
    throw repositoryOperationError(
      'write',
      resolved.logicalPath,
      'The written repository file could not be read back.',
    );
  }

  return {
    path: resolved.logicalPath,
    revision: written.revision,
  };
}

async function deleteRepositoryFile(
  root: RepositoryRoot,
  input: DeleteFileInput,
  resolved: ResolvedRepositoryPath,
): Promise<DeleteFileResult> {
  const initial = await readExistingFile(root, resolved, 'delete');

  if (!initial) {
    throw missingFileError('delete', resolved.logicalPath);
  }

  assertExpectedRevision('delete', resolved.logicalPath, input.expectedRevision, initial.revision);

  // Re-read immediately before deletion to reduce the stale-delete race window.
  const latest = await readExistingFile(root, resolved, 'delete');

  if (!latest) {
    throw missingFileError('delete', resolved.logicalPath);
  }

  assertExpectedRevision('delete', resolved.logicalPath, input.expectedRevision, latest.revision);

  try {
    await unlink(latest.nativePath);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      throw missingFileError('delete', resolved.logicalPath);
    }

    throw error;
  }

  return { path: resolved.logicalPath };
}

function assertExpectedRevision(
  operation: 'write' | 'delete',
  path: string,
  expectedRevision: string | undefined,
  actualRevision: string | undefined,
): void {
  if (expectedRevision === undefined || expectedRevision === actualRevision) {
    return;
  }

  throw new RepositoryConflictError(undefined, {
    metadata: {
      operation,
      path,
      expectedRevision,
      ...(actualRevision === undefined ? {} : { actualRevision }),
    },
  });
}

function revisionFor(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isPithTemporaryFile(name: string): boolean {
  return name.startsWith(TEMPORARY_FILE_PREFIX);
}

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null;
    }

    throw error;
  }
}

async function assertRealPathWithinRoot(
  root: RepositoryRoot,
  nativePath: string,
  logicalPath: string,
): Promise<void> {
  const realPath = await realpath(nativePath);
  const fromRoot = relative(root.realDirectory, realPath);

  if (
    (fromRoot.length > 0 && fromRoot === '..') ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw unsafePathError(
      logicalPath,
      'Repository paths must not resolve outside the configured root.',
    );
  }
}

function assertNotSymbolicLink(isSymbolicLink: boolean, logicalPath: string): void {
  if (isSymbolicLink) {
    throw unsafePathError(
      logicalPath,
      'Symbolic links are not supported by the filesystem repository.',
    );
  }
}

async function removeTemporaryFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      // A failed cleanup must not replace the original write failure.
    }
  }
}

async function withPathLock<TValue>(
  locks: Map<string, Promise<void>>,
  path: string,
  operation: () => Promise<TValue>,
): Promise<TValue> {
  const previous = locks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    release = resolveCurrent;
  });
  const tail = previous.then(() => current);
  locks.set(path, tail);
  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (locks.get(path) === tail) {
      locks.delete(path);
    }
  }
}

function normalizeFilesystemError(operation: string, path: string, error: unknown): PithError {
  if (error instanceof PithError) {
    return error;
  }

  if (hasCode(error, 'ENOENT') && operation === 'delete') {
    return missingFileError(operation, path);
  }

  if (hasCode(error, 'EACCES') || hasCode(error, 'EPERM') || hasCode(error, 'EROFS')) {
    return repositoryOperationError(
      operation,
      path,
      `Filesystem ${operation} access was denied.`,
      error,
    );
  }

  return repositoryOperationError(operation, path, `Filesystem ${operation} failed.`, error);
}

function repositoryOperationError(
  operation: string,
  path: string,
  message: string,
  cause?: unknown,
): RepositoryError {
  return new RepositoryError(message, {
    ...(cause === undefined ? {} : { cause }),
    metadata: { operation, path },
  });
}

function missingFileError(operation: string, path: string): RepositoryNotFoundError {
  return new RepositoryNotFoundError(undefined, {
    metadata: { operation, path },
  });
}

function unsafePathError(path: string, message: string): ContentPathError {
  return new ContentPathError(message, { metadata: { path } });
}

function hasCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
