import { defineCollection, definePith, field } from '@pith-cms/core';

export default definePith({
  contentRoot: 'content',
  collections: {
    docs: defineCollection({
      path: 'docs',
      format: 'markdown',
      identifierField: 'slug',
      displayField: 'title',
      order: 'position',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ required: true }),
        description: field.text({ multiline: true }),
        position: field.number({ required: true }),
        body: field.markdown({
          required: true,
          editor: {
            dialect: 'gfm',
            features: [
              'heading-1',
              'heading-2',
              'heading-3',
              'strong',
              'emphasis',
              'link',
              'blockquote',
              'unordered-list',
              'ordered-list',
              'inline-code',
              'code-block',
              'table',
            ],
          },
        }),
      },
    }),
  },
});
