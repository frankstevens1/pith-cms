import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ContentPathError,
  createContentService,
  defineCollection,
  definePith,
  field,
  RepositoryConflictError,
} from '@pith-cms/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFilesystemRepository } from '../src/index.js';

describe('filesystem repository implementation', () => {
  let rootDirectory: string;
  let outsideDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'pith-filesystem-root-'));
    outsideDirectory = await mkdtemp(join(tmpdir(), 'pith-filesystem-outside-'));
  });

  afterEach(async () => {
    await Promise.all([
      rm(rootDirectory, { force: true, recursive: true }),
      rm(outsideDirectory, { force: true, recursive: true }),
    ]);
  });

  it('normalizes logical separators and preserves supplied bytes through atomic replacement', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    const initial = await repository.write({
      path: 'content//pages/home.txt',
      content: 'first\r\n',
      message: 'Create home',
    });
    const updated = await repository.write({
      path: 'content/pages/home.txt',
      content: 'second\r\n🙂\n',
      expectedRevision: initial.revision,
      message: 'Update home',
    });

    expect(updated.path).toBe('content/pages/home.txt');
    await expect(
      readFile(join(rootDirectory, 'content', 'pages', 'home.txt'), 'utf8'),
    ).resolves.toBe('second\r\n🙂\n');
    await expect(readdir(join(rootDirectory, 'content', 'pages'))).resolves.not.toContainEqual(
      expect.stringMatching(/^\.pith-tmp-/),
    );
  });

  it('cleans temporary files and leaves the previous target unchanged after a rejected write', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    const created = await repository.write({
      path: 'content/pages/home.txt',
      content: 'stable',
      message: 'Create home',
    });

    await expect(
      repository.write({
        path: 'content/pages/home.txt',
        content: 'stale',
        expectedRevision: 'sha256:not-current',
        message: 'Stale update',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    await expect(repository.read('content/pages/home.txt')).resolves.toEqual(
      expect.objectContaining({ content: 'stable', revision: created.revision }),
    );
    await expect(readdir(join(rootDirectory, 'content', 'pages'))).resolves.not.toContainEqual(
      expect.stringMatching(/^\.pith-tmp-/),
    );
  });

  it('rejects create-only writes when a target already exists', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    await repository.write({
      path: 'content/pages/home.txt',
      content: 'first',
      message: 'Create home',
    });

    await expect(
      repository.write({
        path: 'content/pages/home.txt',
        content: 'second',
        createOnly: true,
        message: 'Create duplicate home',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it('rejects direct files and parent directories backed by symbolic links', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    await writeFile(join(outsideDirectory, 'secret.txt'), 'secret');
    await symlink(join(outsideDirectory, 'secret.txt'), join(rootDirectory, 'linked.txt'));
    await symlink(outsideDirectory, join(rootDirectory, 'linked-directory'));

    await expect(repository.read('linked.txt')).rejects.toBeInstanceOf(ContentPathError);
    await expect(repository.read('linked-directory/secret.txt')).rejects.toBeInstanceOf(
      ContentPathError,
    );
    await expect(
      repository.delete({ path: 'linked.txt', message: 'Unsafe delete' }),
    ).rejects.toBeInstanceOf(ContentPathError);
    await expect(
      repository.write({
        path: 'linked-directory/new.txt',
        content: 'unsafe',
        message: 'Unsafe write',
      }),
    ).rejects.toBeInstanceOf(ContentPathError);
    await expect(repository.list('linked-directory')).rejects.toBeInstanceOf(ContentPathError);
  });

  it('rejects listings that contain symbolic link entries', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    await repository.write({
      path: 'content/posts/inside.txt',
      content: 'inside',
      message: 'Create inside file',
    });
    await symlink(
      join(outsideDirectory, 'outside.txt'),
      join(rootDirectory, 'content', 'posts', 'link'),
    );

    await expect(repository.list('content/posts')).rejects.toBeInstanceOf(ContentPathError);
  });

  it('serializes competing same-process writes against one revision', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    const initial = await repository.write({
      path: 'content/pages/home.txt',
      content: 'initial',
      message: 'Create home',
    });
    const [first, second] = await Promise.allSettled([
      repository.write({
        path: 'content/pages/home.txt',
        content: 'first',
        expectedRevision: initial.revision,
        message: 'First update',
      }),
      repository.write({
        path: 'content/pages/home.txt',
        content: 'second',
        expectedRevision: initial.revision,
        message: 'Second update',
      }),
    ]);

    expect([first, second].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect([first, second].filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.any(RepositoryConflictError) }),
    ]);
  });

  it('preserves an existing file mode when the platform supports POSIX modes', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const repository = createFilesystemRepository({ rootDirectory });
    const created = await repository.write({
      path: 'content/pages/home.txt',
      content: 'initial',
      message: 'Create home',
    });
    const nativePath = join(rootDirectory, 'content', 'pages', 'home.txt');
    await chmod(nativePath, 0o640);

    await repository.write({
      path: 'content/pages/home.txt',
      content: 'updated',
      expectedRevision: created.revision,
      message: 'Update home',
    });

    expect((await stat(nativePath)).mode & 0o777).toBe(0o640);
  });

  it('supports the Phase 1 content service end-to-end', async () => {
    const repository = createFilesystemRepository({ rootDirectory });
    const config = definePith({
      contentRoot: 'content',
      collections: {
        pages: defineCollection({
          path: 'pages',
          format: 'json',
          identifierField: 'slug',
          fields: {
            title: field.text({ required: true }),
            slug: field.slug({ required: true }),
            published: field.boolean({ defaultValue: true }),
          },
        }),
      },
    });
    const content = createContentService({ config, repository });

    const created = await content.writeEntry({
      collection: 'pages',
      identifier: 'home',
      value: { title: 'Home', slug: 'home' },
      message: 'Create home',
    });
    const loaded = await content.getEntry('pages', 'home');

    expect(loaded).toEqual(
      expect.objectContaining({
        revision: created.revision,
        value: { title: 'Home', slug: 'home', published: true },
      }),
    );

    const updated = await content.writeEntry({
      collection: 'pages',
      identifier: 'home',
      value: { title: 'Home updated', slug: 'home' },
      expectedRevision: created.revision,
      message: 'Update home',
    });

    await expect(
      content.writeEntry({
        collection: 'pages',
        identifier: 'home',
        value: { title: 'Stale', slug: 'home' },
        expectedRevision: created.revision,
        message: 'Stale update',
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      content.deleteEntry({
        collection: 'pages',
        identifier: 'home',
        expectedRevision: updated.revision,
        message: 'Delete home',
      }),
    ).resolves.toEqual({ path: 'content/pages/home.json' });
  });
});
