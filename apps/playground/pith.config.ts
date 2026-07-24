import { defineCollection, definePith, field } from '@pith-cms/core';

export const pith = definePith({
  contentRoot: 'content',
  collections: {
    pages: defineCollection({
      label: 'Pages',
      path: 'pages',
      format: 'json',
      identifierField: 'slug',
      displayField: 'title',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ source: 'title', required: true }),
        published: field.boolean({
          label: 'Published',
          description:
            'Published pages are visible to visitors. Unpublished pages remain editable and can be previewed without saving.',
          defaultValue: true,
        }),
        seo: field.object({
          fields: {
            description: field.text({ multiline: true }),
            keywords: field.list({ item: field.text({ required: true }) }),
          },
        }),
      },
    }),
    posts: defineCollection({
      label: 'Posts',
      path: 'posts',
      format: 'markdown',
      identifierField: 'slug',
      displayField: 'title',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ source: 'title', required: true }),
        publishedAt: field.datetime(),
        body: field.markdown({ required: true }),
      },
    }),
  },
});

export default pith;
