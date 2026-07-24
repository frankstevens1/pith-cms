import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <TArguments extends readonly unknown[], TResult>(
      operation: (...arguments_: TArguments) => TResult,
    ) => {
      const values = new Map<string, TResult>();

      return (...arguments_: TArguments): TResult => {
        const key = JSON.stringify(arguments_);
        const value = values.get(key);

        if (value !== undefined) {
          return value;
        }

        const nextValue = operation(...arguments_);
        values.set(key, nextValue);
        return nextValue;
      };
    },
  };
});

vi.mock('next/cache', () => ({
  revalidateTag,
  unstable_cache: <TResult>(operation: () => TResult) => operation,
}));

import { createPith } from '../src/server-implementation.js';
import { MemoryRepository, testConfig, validFiles } from './fixtures.js';

describe('Pith cache modes', () => {
  beforeEach(() => {
    revalidateTag.mockClear();
  });

  it('does not retain reads in no-store mode', async () => {
    const repository = new MemoryRepository(validFiles);
    const pith = createPith({ config: testConfig, repository, cache: { mode: 'no-store' } });

    await pith.content.getEntry('pages', 'home');
    await pith.content.getEntry('pages', 'home');

    expect(repository.readPaths).toEqual(['content/pages/home.json', 'content/pages/home.json']);
  });

  it('uses distinct request cache wrappers for each Pith instance', async () => {
    const repository = new MemoryRepository(validFiles);
    const first = createPith({ config: testConfig, repository });
    const second = createPith({ config: testConfig, repository });

    await first.content.getEntry('pages', 'home');
    await first.content.getEntry('pages', 'home');
    await second.content.getEntry('pages', 'home');

    expect(repository.readPaths).toEqual(['content/pages/home.json', 'content/pages/home.json']);
  });

  it('keeps cache keys distinct for collection operations', async () => {
    const repository = new MemoryRepository(validFiles);
    const pith = createPith({ config: testConfig, repository });

    await pith.content.getEntry('pages', 'home');
    await pith.content.getEntry('posts', 'first-post');

    expect(repository.readPaths).toEqual([
      'content/pages/home.json',
      'content/posts/first-post.md',
    ]);
  });

  it('expires entry tags immediately after a canonical mutation', async () => {
    const pith = createPith({
      config: testConfig,
      repository: new MemoryRepository(validFiles),
      cache: { mode: 'persistent' },
    });

    await pith.cache.revalidateEntry('pages', 'home');

    expect(revalidateTag).toHaveBeenCalledWith('pith', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('pith:collection:pages', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('pith:entry:pages:home', { expire: 0 });
  });
});
