# @pith-cms/core

Framework-independent content definitions and services for Pith.

```ts
import { defineCollection, definePith, field } from '@pith-cms/core';

const pages = defineCollection({
  path: 'pages',
  format: 'json',
  identifierField: 'slug',
  fields: {
    title: field.text({ required: true }),
    slug: field.slug({ source: 'title', required: true }),
    published: field.boolean({ defaultValue: true }),
  },
});

export const pith = definePith({
  contentRoot: 'content',
  collections: { pages },
});
```

The package validates configuration, compiles field definitions to runtime schemas, serializes JSON
and Markdown deterministically, and exposes a storage-neutral repository contract and content
service. It has no dependency on Next.js, React, a filesystem, GitHub, or authentication.

## Deliberately deferred

MDX, relations, conditional fields, custom field plugins, media, rendering, and automatic slug
updates are intentionally deferred. Slug generation is explicit through `createSlug`; validation
never mutates saved identifiers. Markdown collections require exactly one `markdown` body field,
and unknown content fields are rejected to avoid silent data loss.
