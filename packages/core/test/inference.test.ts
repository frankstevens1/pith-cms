import { expectTypeOf, test } from 'vitest';

import { defineCollection, field, type InferCollectionEntry } from '../src/index.js';

const collection = defineCollection({
  path: 'articles',
  format: 'json',
  identifierField: 'slug',
  fields: {
    title: field.text({ required: true }),
    slug: field.slug({ required: true }),
    published: field.boolean({ defaultValue: true }),
    summary: field.text(),
    status: field.select({
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ] as const,
    }),
    author: field.object({
      fields: {
        name: field.text({ required: true }),
        website: field.url(),
      },
    }),
    settings: field.object({
      fields: {
        enabled: field.boolean({ defaultValue: true }),
      },
    }),
    tags: field.list({ item: field.text({ required: true }) }),
  },
});

const markdownField = field.markdown({
  required: true,
  editor: {
    dialect: 'gfm',
    features: ['heading-2', 'strong', 'table'] as const,
  },
});

type Article = InferCollectionEntry<typeof collection>;

test('collection entries are inferred from fields', () => {
  expectTypeOf<Article>().toEqualTypeOf<{
    title: string;
    slug: string;
    published: boolean;
    summary?: string;
    status?: 'draft' | 'published';
    author?: { name: string; website?: string };
    settings: { enabled: boolean };
    tags?: readonly string[];
  }>();
});

test('markdown editor options preserve their literal types', () => {
  expectTypeOf(markdownField.options.required).toEqualTypeOf<true>();
  expectTypeOf(markdownField.options.editor.dialect).toEqualTypeOf<'gfm'>();
  expectTypeOf(markdownField.options.editor.features).toEqualTypeOf<
    readonly ['heading-2', 'strong', 'table']
  >();
});
