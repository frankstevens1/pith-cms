import { defineCollection, definePith, field } from '@pith-cms/core';

const config = definePith({
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
});

export default config;
