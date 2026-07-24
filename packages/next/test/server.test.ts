import {
  ConfigurationError,
  ContentNotFoundError,
  ContentParseError,
  ContentValidationError,
  RepositoryError,
} from '@pith-cms/core';
import { describe, expect, it } from 'vitest';

import {
  createPith,
  getPithCollectionTag,
  getPithEntryTag,
  getPithRootTag,
} from '../src/server-implementation.js';
import { MemoryRepository, testConfig, validFiles } from './fixtures.js';

describe('createPith', () => {
  it('reads required and optional typed entries through logical repository paths', async () => {
    const repository = new MemoryRepository(validFiles);
    const pith = createPith({ config: testConfig, repository, cache: { mode: 'no-store' } });

    const page = await pith.content.getEntry('pages', 'home');
    const missing = await pith.content.getOptionalEntry('pages', 'missing');

    expect(page).toMatchObject({
      collection: 'pages',
      identifier: 'home',
      path: 'content/pages/home.json',
      value: { title: 'Home', slug: 'home', published: true },
    });
    expect(missing).toBeNull();
    expect(repository.readPaths).toEqual(['content/pages/home.json', 'content/pages/missing.json']);
  });

  it('converts only absent required entries to ContentNotFoundError', async () => {
    const pith = createPith({
      config: testConfig,
      repository: new MemoryRepository(),
      cache: { mode: 'no-store' },
    });

    await expect(pith.content.getEntry('pages', 'missing')).rejects.toMatchObject({
      code: 'CONTENT_NOT_FOUND',
      metadata: {
        collection: 'pages',
        identifier: 'missing',
        path: 'content/pages/missing.json',
      },
    } satisfies Partial<ContentNotFoundError>);
  });

  it('preserves parsing, validation, and repository failures', async () => {
    const parseRepository = new MemoryRepository({
      'content/pages/home.json': '{ not json',
    });
    const validationRepository = new MemoryRepository({
      'content/pages/home.json': '{"slug":"home"}',
    });
    const failureRepository = new MemoryRepository(validFiles);
    failureRepository.read = async () => {
      throw new RepositoryError('Repository is unavailable.');
    };

    await expect(
      createPith({ config: testConfig, repository: parseRepository }).content.getEntry(
        'pages',
        'home',
      ),
    ).rejects.toBeInstanceOf(ContentParseError);
    await expect(
      createPith({ config: testConfig, repository: validationRepository }).content.getEntry(
        'pages',
        'home',
      ),
    ).rejects.toBeInstanceOf(ContentValidationError);
    await expect(
      createPith({ config: testConfig, repository: failureRepository }).content.getOptionalEntry(
        'pages',
        'home',
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('lists valid entries, surfaces invalid entries, and derives flat identifiers', async () => {
    const repository = new MemoryRepository({
      ...validFiles,
      'content/posts/broken.md': '---\ntitle: Broken\n---\n\nBroken.',
      'content/posts/notes.txt': 'not a Pith entry',
      'content/posts/nested/hidden.md': '---\ntitle: Hidden\nslug: hidden\n---\n\nHidden.',
    });
    const pith = createPith({ config: testConfig, repository, cache: { mode: 'no-store' } });

    const listed = await pith.content.listEntries('posts');
    const withoutInvalid = await pith.content.listEntries('posts', { includeInvalid: false });
    const identifiers = await pith.content.getEntryIdentifiers('posts');

    expect(listed.entries.map((entry) => entry.identifier)).toEqual(['first-post']);
    expect(listed.invalidEntries).toHaveLength(1);
    expect(listed.invalidEntries[0]?.path).toBe('content/posts/broken.md');
    expect(withoutInvalid.invalidEntries).toEqual([]);
    expect(identifiers).toEqual(['broken', 'first-post']);
    expect(repository.listDirectories).toEqual(['content/posts', 'content/posts', 'content/posts']);
  });

  it('exposes immutable collection metadata', () => {
    const pith = createPith({ config: testConfig, repository: new MemoryRepository() });
    const collection = pith.content.getCollection('posts');

    expect(collection).toEqual({
      name: 'posts',
      label: 'Posts',
      path: 'posts',
      format: 'markdown',
      identifierField: 'slug',
    });
    expect(Object.isFrozen(collection)).toBe(true);
  });

  it('validates initialization and cache configuration eagerly', () => {
    expect(() =>
      createPith({ config: undefined as never, repository: new MemoryRepository() }),
    ).toThrow('Pith configuration');
    expect(() =>
      createPith({
        config: testConfig,
        repository: { read: async () => null } as never,
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createPith({
        config: testConfig,
        repository: new MemoryRepository(),
        cache: { mode: 'unknown' as never },
      }),
    ).toThrow('Pith cache mode');
    expect(() => getPithCollectionTag('posts/drafts')).toThrow(ConfigurationError);
  });

  it('generates deterministic future cache tags', () => {
    expect(getPithRootTag()).toBe('pith');
    expect(getPithCollectionTag('posts')).toBe('pith:collection:posts');
    expect(getPithEntryTag('posts', 'first-post')).toBe('pith:entry:posts:first-post');
  });
});
