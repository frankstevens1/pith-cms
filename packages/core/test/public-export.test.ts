import { describe, expect, it } from 'vitest';
import { version } from '../package.json';

import {
  ContentNotFoundError,
  defineCollection,
  field,
  pithVersion,
  supportsPublicationStatus,
  supportsRepositoryRefs,
} from '../src/index.js';

describe('@pith-cms/core public export', () => {
  it('exposes the package version marker', () => {
    expect(pithVersion).toBe(version);
  });

  it('exposes the public configuration API', () => {
    expect(
      defineCollection({
        path: 'pages',
        format: 'json',
        identifierField: 'slug',
        fields: { slug: field.slug({ required: true }) },
      }).path,
    ).toBe('pages');
  });

  it('exposes the content-level missing-entry error', () => {
    expect(new ContentNotFoundError().code).toBe('CONTENT_NOT_FOUND');
  });

  it('guards optional repository capabilities without widening the base contract', () => {
    const repository = {
      read: async () => null,
      list: async () => [],
      write: async () => ({ path: 'content/a.json', revision: 'revision' }),
      delete: async () => ({ path: 'content/a.json' }),
    };
    expect(supportsRepositoryRefs(repository)).toBe(false);
    expect(supportsPublicationStatus(repository)).toBe(false);

    const withCapabilities = {
      ...repository,
      readAtRef: async () => null,
      listAtRef: async () => [],
      getPublicationStatus: async () => ({ state: 'unknown' as const }),
    };
    expect(supportsRepositoryRefs(withCapabilities)).toBe(true);
    expect(supportsPublicationStatus(withCapabilities)).toBe(true);
  });
});
