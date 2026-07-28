import { describe, expect, it } from 'vitest';

import {
  ConfigurationError,
  defineCollection,
  definePith,
  field,
  type CollectionDefinition,
  type FieldRecord,
} from '../src/index.js';

describe('Pith configuration', () => {
  it('normalizes relative content and collection paths', () => {
    const config = definePith({
      contentRoot: 'content\\site',
      collections: {
        pages: defineCollection({
          path: 'pages//marketing',
          format: 'json',
          identifierField: 'slug',
          fields: { slug: field.slug({ required: true }) },
        }),
      },
    });

    expect(config.contentRoot).toBe('content/site');
    expect(config.collections.pages.path).toBe('pages//marketing');
  });

  it.each([
    [
      'duplicate collection paths',
      {
        pages: validCollection('pages'),
        archive: validCollection('pages'),
      },
    ],
    ['an absolute content root', { pages: validCollection('pages') }, '/content'],
    ['a traversal collection path', { pages: validCollection('../pages') }],
    [
      'a missing identifier field',
      {
        pages: {
          path: 'pages',
          format: 'json',
          identifierField: 'missing',
          fields: { slug: field.slug({ required: true }) },
        } as unknown as CollectionDefinition,
      },
    ],
    [
      'empty field definitions',
      {
        pages: {
          path: 'pages',
          format: 'json',
          identifierField: 'slug',
          fields: {} as FieldRecord,
        } as CollectionDefinition,
      },
    ],
    [
      'markdown collections without one body field',
      {
        pages: {
          path: 'pages',
          format: 'markdown',
          identifierField: 'slug',
          fields: { slug: field.slug({ required: true }) },
        } as unknown as CollectionDefinition,
      },
    ],
  ])('rejects %s', (_name, collections, contentRoot = 'content') => {
    expect(() => definePith({ contentRoot, collections })).toThrow(ConfigurationError);
  });

  it('rejects empty nested object definitions and invalid field options', () => {
    const invalidObject = {
      kind: 'object',
      options: { fields: {} },
    } as unknown as ReturnType<typeof field.object>;
    const invalidText = {
      kind: 'text',
      options: { minLength: 4, maxLength: 2 },
    } as unknown as ReturnType<typeof field.text>;

    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          pages: defineCollection({
            path: 'pages',
            format: 'json',
            identifierField: 'slug',
            fields: { slug: field.slug({ required: true }), metadata: invalidObject },
          }),
        },
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          pages: defineCollection({
            path: 'pages',
            format: 'json',
            identifierField: 'slug',
            fields: { slug: field.slug({ required: true }), title: invalidText },
          }),
        },
      }),
    ).toThrow(ConfigurationError);
  });

  it('accepts a declared Markdown editor profile', () => {
    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          posts: defineCollection({
            path: 'posts',
            format: 'markdown',
            identifierField: 'slug',
            fields: {
              slug: field.slug({ required: true }),
              body: field.markdown({
                required: true,
                editor: {
                  dialect: 'gfm',
                  features: ['heading-2', 'strong', 'unordered-list', 'task-list'],
                },
              }),
            },
          }),
        },
      }),
    ).not.toThrow();

    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          posts: defineCollection({
            path: 'posts',
            format: 'markdown',
            identifierField: 'slug',
            fields: {
              slug: field.slug({ required: true }),
              body: field.markdown({
                editor: {
                  dialect: 'gfm',
                  features: ['ordered-list', 'task-list'],
                },
              }),
            },
          }),
        },
      }),
    ).not.toThrow();
  });

  it.each([
    ['an unsupported dialect', { dialect: 'mdx', features: [] }],
    ['an unsupported feature', { features: ['video'] }],
    ['duplicate features', { features: ['strong', 'strong'] }],
    ['GFM features in CommonMark', { features: ['table'] }],
    ['task lists without a list style', { dialect: 'gfm', features: ['task-list'] }],
  ])('rejects Markdown editor profiles with %s', (_name, editor) => {
    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          posts: defineCollection({
            path: 'posts',
            format: 'markdown',
            identifierField: 'slug',
            fields: {
              slug: field.slug({ required: true }),
              body: field.markdown({ editor } as never),
            },
          }),
        },
      }),
    ).toThrow(ConfigurationError);
  });

  it('accepts scalar display fields and rejects missing or nested display fields', () => {
    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          pages: defineCollection({
            path: 'pages',
            format: 'json',
            identifierField: 'slug',
            displayField: 'title',
            fields: {
              title: field.text({ required: true }),
              slug: field.slug({ required: true }),
            },
          }),
        },
      }),
    ).not.toThrow();

    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          pages: defineCollection({
            path: 'pages',
            format: 'json',
            identifierField: 'slug',
            displayField: 'metadata',
            fields: {
              slug: field.slug({ required: true }),
              metadata: field.object({ fields: { title: field.text() } }),
            },
          }),
        },
      }),
    ).toThrow(ConfigurationError);

    expect(() =>
      definePith({
        contentRoot: 'content',
        collections: {
          pages: defineCollection({
            path: 'pages',
            format: 'json',
            identifierField: 'slug',
            displayField: 'missing' as never,
            fields: { slug: field.slug({ required: true }) },
          }),
        },
      }),
    ).toThrow(ConfigurationError);
  });
});

function validCollection(path: string) {
  return defineCollection({
    path,
    format: 'json',
    identifierField: 'slug',
    fields: { slug: field.slug({ required: true }) },
  });
}
