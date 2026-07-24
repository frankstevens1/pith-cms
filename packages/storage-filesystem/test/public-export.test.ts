import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFilesystemRepository } from '../src/index.js';

describe('@pith-cms/storage-filesystem public exports', () => {
  it('exposes the filesystem repository factory from the built package', async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), 'pith-filesystem-export-'));

    try {
      const repository = createFilesystemRepository({ rootDirectory });
      const written = await repository.write({
        path: 'content/home.txt',
        content: 'home',
        message: 'Create home',
      });

      await expect(repository.read(written.path)).resolves.toEqual(
        expect.objectContaining({ content: 'home', revision: written.revision }),
      );
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });
});
