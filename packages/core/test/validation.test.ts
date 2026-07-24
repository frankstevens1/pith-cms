import { describe, expect, it } from 'vitest';

import {
  createDefaultEntry,
  createSlug,
  defineCollection,
  field,
  validateEntry,
} from '../src/index.js';
import { pages } from './fixtures.js';

describe('field validation and defaults', () => {
  it('validates every initial field type and applies defaults', () => {
    const result = validateEntry({
      collection: pages,
      value: {
        title: 'Home',
        slug: 'home',
        views: 3,
        publishedOn: '2026-07-20',
        publishedAt: '2026-07-20T10:00:00.000Z',
        website: 'https://pith.dev/docs',
        contact: 'hello@pith.dev',
        status: 'published',
        tags: ['news', 'product'],
        author: { name: 'Ada', email: 'ada@pith.dev' },
        sections: [{ heading: 'Welcome', text: 'Hello' }],
      },
    });

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        title: 'Home',
        slug: 'home',
        published: true,
        status: 'published',
      }),
    });
  });

  it('reports structured nested errors without exposing parser internals', () => {
    const result = validateEntry({
      collection: pages,
      value: {
        title: 'H',
        slug: 'Home--Page',
        views: 1.5,
        publishedOn: '20/07/2026',
        publishedAt: '2026-07-20T10:00:00Z',
        website: 'ftp://pith.dev',
        contact: 'invalid-email',
        status: 'archived',
        tags: ['news', 'news'],
        author: { name: 'Ada', email: 'not-an-email' },
        sections: [{ heading: 2 }],
        unexpected: true,
      },
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'too_small', path: ['title'] }),
          expect.objectContaining({ path: ['slug'] }),
          expect.objectContaining({ path: ['author', 'email'] }),
          expect.objectContaining({ path: ['sections', 0, 'heading'] }),
          expect.objectContaining({ code: 'unrecognized_key', path: ['unexpected'] }),
        ]),
      );
    }
  });

  it('creates only explicit defaults', () => {
    expect(createDefaultEntry(pages)).toEqual({ published: true });
  });

  it('recursively creates nested defaults and retains configured list defaults', () => {
    const collection = defineCollection({
      path: 'defaults',
      format: 'json',
      identifierField: 'slug',
      fields: {
        slug: field.slug({ required: true }),
        settings: field.object({
          fields: {
            enabled: field.boolean({ defaultValue: true }),
          },
        }),
        tags: field.list({
          item: field.text({ required: true }),
          defaultValue: ['starter'],
        }),
      },
    });

    expect(createDefaultEntry(collection)).toEqual({
      settings: { enabled: true },
      tags: ['starter'],
    });
  });

  it('creates explicit slugs but never mutates supplied values during validation', () => {
    expect(createSlug('Building Pith')).toBe('building-pith');
    expect(createSlug('Café & tea')).toBe('cafe-tea');

    const result = validateEntry({
      collection: pages,
      value: { title: 'Home', slug: 'Home' },
    });

    expect(result.success).toBe(false);
  });
});
