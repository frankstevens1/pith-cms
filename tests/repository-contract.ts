import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface RepositoryFile {
  readonly path: string;
  readonly content: string;
  readonly revision: string;
  readonly updatedAt?: string;
}

interface RepositoryFileSummary {
  readonly path: string;
  readonly revision: string;
  readonly updatedAt?: string;
}

interface RepositoryUnderTest {
  read(path: string): Promise<RepositoryFile | null>;
  list(directory: string): Promise<readonly RepositoryFileSummary[]>;
  write(input: {
    readonly path: string;
    readonly content: string;
    readonly expectedRevision?: string;
    readonly message: string;
  }): Promise<{ readonly path: string; readonly revision: string }>;
  delete(input: {
    readonly path: string;
    readonly expectedRevision?: string;
    readonly message: string;
  }): Promise<{ readonly path: string }>;
}

type ErrorConstructor = new (...arguments_: never[]) => Error;

export interface RepositoryContractHarness {
  readonly repository: RepositoryUnderTest;
  cleanup(): Promise<void>;
}

export interface RepositoryContractOptions {
  readonly name: string;
  createRepository(): Promise<RepositoryContractHarness>;
  readonly errors: {
    readonly ContentPathError: ErrorConstructor;
    readonly RepositoryConflictError: ErrorConstructor;
    readonly RepositoryError: ErrorConstructor;
    readonly RepositoryNotFoundError: ErrorConstructor;
  };
}

/**
 * Reusable behavioral checks for every ContentRepository adapter.
 * Adapter-specific tests should cover implementation details separately.
 */
export function repositoryContractTests({
  name,
  createRepository,
  errors,
}: RepositoryContractOptions): void {
  describe(`ContentRepository contract (${name})`, () => {
    let harness: RepositoryContractHarness;

    beforeEach(async () => {
      harness = await createRepository();
    });

    afterEach(async () => {
      await harness.cleanup();
    });

    it('reads exact Unicode content with a stable revision', async () => {
      const content = 'Hello, Pith 👋\r\n';
      const written = await harness.repository.write({
        path: 'content/pages/home.txt',
        content,
        message: 'Create home',
      });
      const first = await harness.repository.read('content/pages/home.txt');
      const second = await harness.repository.read('content/pages/home.txt');

      expect(first).toEqual(
        expect.objectContaining({
          path: 'content/pages/home.txt',
          content,
          revision: written.revision,
        }),
      );
      expect(second?.revision).toBe(first?.revision);
      if (first?.updatedAt !== undefined) {
        expect(first.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('returns null only for a missing file', async () => {
      await expect(harness.repository.read('content/pages/missing.txt')).resolves.toBeNull();

      await harness.repository.write({
        path: 'content/pages/home.txt',
        content: 'home',
        message: 'Create home',
      });

      await expect(harness.repository.read('content/pages')).rejects.toBeInstanceOf(
        errors.RepositoryError,
      );
    });

    it('lists direct files in logical lexical order with matching revisions', async () => {
      await harness.repository.write({
        path: 'content/posts/zeta.txt',
        content: 'zeta',
        message: 'Create zeta',
      });
      await harness.repository.write({
        path: 'content/posts/alpha.txt',
        content: 'alpha',
        message: 'Create alpha',
      });
      await harness.repository.write({
        path: 'content/posts/.draft.txt',
        content: 'draft',
        message: 'Create draft',
      });
      await harness.repository.write({
        path: 'content/posts/nested/child.txt',
        content: 'child',
        message: 'Create nested child',
      });
      await harness.repository.write({
        path: 'content/posts/.pith-tmp-test',
        content: 'temporary',
        message: 'Create temporary file',
      });

      const listed = await harness.repository.list('content/posts');

      expect(listed.map((file) => file.path)).toEqual([
        'content/posts/.draft.txt',
        'content/posts/alpha.txt',
        'content/posts/zeta.txt',
      ]);
      await expect(harness.repository.list('content/missing')).resolves.toEqual([]);
      await expect(harness.repository.list('content/posts/alpha.txt')).rejects.toBeInstanceOf(
        errors.RepositoryError,
      );

      for (const summary of listed) {
        const file = await harness.repository.read(summary.path);
        expect(file?.revision).toBe(summary.revision);
      }
    });

    it('creates parent directories, updates exact content, and protects expected revisions', async () => {
      const created = await harness.repository.write({
        path: 'content/deep/pages/home.txt',
        content: 'one\r\ntwo\n',
        message: 'Create home',
      });
      const updated = await harness.repository.write({
        path: 'content/deep/pages/home.txt',
        content: 'three\r\nfour\n',
        expectedRevision: created.revision,
        message: 'Update home',
      });

      expect(updated.revision).not.toBe(created.revision);
      await expect(harness.repository.read('content/deep/pages/home.txt')).resolves.toEqual(
        expect.objectContaining({ content: 'three\r\nfour\n', revision: updated.revision }),
      );

      await expect(
        harness.repository.write({
          path: 'content/deep/pages/home.txt',
          content: 'stale',
          expectedRevision: created.revision,
          message: 'Stale update',
        }),
      ).rejects.toBeInstanceOf(errors.RepositoryConflictError);

      await expect(
        harness.repository.write({
          path: 'content/deep/pages/missing.txt',
          content: 'missing',
          expectedRevision: created.revision,
          message: 'Stale create',
        }),
      ).rejects.toBeInstanceOf(errors.RepositoryConflictError);
      await expect(harness.repository.read('content/deep/pages/missing.txt')).resolves.toBeNull();
    });

    it('deletes only existing files and protects expected revisions', async () => {
      const created = await harness.repository.write({
        path: 'content/pages/about.txt',
        content: 'about',
        message: 'Create about',
      });
      const updated = await harness.repository.write({
        path: 'content/pages/about.txt',
        content: 'updated about',
        expectedRevision: created.revision,
        message: 'Update about',
      });

      await expect(
        harness.repository.delete({
          path: 'content/pages/about.txt',
          expectedRevision: created.revision,
          message: 'Stale delete',
        }),
      ).rejects.toBeInstanceOf(errors.RepositoryConflictError);
      await expect(
        harness.repository.delete({
          path: 'content/pages/about.txt',
          expectedRevision: updated.revision,
          message: 'Delete about',
        }),
      ).resolves.toEqual(expect.objectContaining({ path: 'content/pages/about.txt' }));
      await expect(harness.repository.read('content/pages/about.txt')).resolves.toBeNull();
      await expect(
        harness.repository.delete({
          path: 'content/pages/about.txt',
          message: 'Delete missing about',
        }),
      ).rejects.toBeInstanceOf(errors.RepositoryNotFoundError);

      await harness.repository.write({
        path: 'content/pages/nested/home.txt',
        content: 'nested',
        message: 'Create nested home',
      });
      await expect(
        harness.repository.delete({ path: 'content/pages/nested', message: 'Delete directory' }),
      ).rejects.toBeInstanceOf(errors.RepositoryError);
    });

    it('rejects unsafe logical paths before repository access', async () => {
      const unsafePaths = [
        '../secret',
        '../../content',
        '/content/pages/home.txt',
        'C:\\secret',
        'C:/secret',
        'content/../../secret',
        'content\\..\\secret',
        '%2e%2e/secret',
        'content/\0secret',
        'file:///tmp/secret',
      ];

      for (const path of unsafePaths) {
        await expect(
          harness.repository.write({ path, content: 'unsafe', message: 'Unsafe write' }),
        ).rejects.toBeInstanceOf(errors.ContentPathError);
      }
    });
  });
}
