import { defineCollection, definePith, field } from '../src/index.js';

export const pages = defineCollection({
  label: 'Pages',
  path: 'pages',
  format: 'json',
  identifierField: 'slug',
  fields: {
    title: field.text({ label: 'Title', required: true, minLength: 2, maxLength: 100 }),
    slug: field.slug({ label: 'Slug', source: 'title', required: true }),
    description: field.text({ multiline: true }),
    published: field.boolean({ defaultValue: true }),
    views: field.number({ min: 0, integer: true }),
    publishedOn: field.date(),
    publishedAt: field.datetime(),
    website: field.url(),
    contact: field.email(),
    status: field.select({
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ] as const,
    }),
    tags: field.multiselect({
      options: [
        { label: 'News', value: 'news' },
        { label: 'Product', value: 'product' },
      ] as const,
    }),
    author: field.object({
      fields: {
        name: field.text({ required: true }),
        email: field.email(),
      },
    }),
    sections: field.list({
      item: field.object({
        fields: {
          heading: field.text({ required: true }),
          text: field.text(),
        },
      }),
    }),
  },
});

export const posts = defineCollection({
  label: 'Posts',
  path: 'posts',
  format: 'markdown',
  identifierField: 'slug',
  fields: {
    title: field.text({ required: true }),
    slug: field.slug({ source: 'title', required: true }),
    publishedAt: field.datetime(),
    body: field.markdown({ required: true }),
  },
});

export const pith = definePith({
  contentRoot: 'content',
  collections: {
    pages,
    posts,
  },
});
