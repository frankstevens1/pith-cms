---
title: Collections
slug: collections
position: 4
description: Define collections once. Get validation and inferred types from them.
---

# Collections

A collection defines the shape, file format, and storage path for a group of
content entries. Each collection drives TypeScript inference, runtime validation,
editor controls, and file serialization — all from one definition in
`pith.config.ts`.

## Defining a collection

```ts
// pith.config.ts
import { defineCollection, definePith, field } from '@pith-cms/core';

export default definePith({
  contentRoot: 'content',
  collections: {
    posts: defineCollection({
      path: 'posts',
      format: 'markdown',
      identifierField: 'slug',
      displayField: 'title',
      order: 'publishedAt',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ source: 'title', required: true }),
        publishedAt: field.datetime(),
        body: field.markdown({ required: true }),
      },
    }),
  },
});
```

| Property          | Required | Description                                                                                      |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `path`            | Yes      | Subdirectory under `contentRoot` where entry files live.                                         |
| `format`          | Yes      | `'json'` for ordered JSON files, `'markdown'` for YAML frontmatter + body.                       |
| `identifierField` | Yes      | Field used as the entry key. Determines the filename (`{identifier}.json` or `{identifier}.md`). |
| `displayField`    | No       | Field shown in the editor's entry list.                                                          |
| `order`           | No       | Sort `listEntries` by this field's value.                                                        |
| `fields`          | Yes      | Entry schema — field kinds and validation rules.                                                 |

`defineCollection` fully infers the entry TypeScript type. Use
`InferCollectionEntry` to extract it:

```ts
import type { InferCollectionEntry } from '@pith-cms/core';
import type config from './pith.config';

type Post = InferCollectionEntry<(typeof config)['collections']['posts']>;
// { title: string; slug: string; publishedAt?: string; body: string }
```

Required fields are non-optional, optional fields stay optional. Nested objects
and lists infer recursively.

## Fields

| Kind                    | Value                  | Useful options                                    |
| ----------------------- | ---------------------- | ------------------------------------------------- |
| `text`                  | string                 | `required`, `minLength`, `maxLength`, `multiline` |
| `number`                | number                 | `min`, `max`, `integer`                           |
| `boolean`               | boolean                | `defaultValue`                                    |
| `date`                  | `YYYY-MM-DD` string    | `required`, `defaultValue`                        |
| `datetime`              | UTC ISO 8601 string    | `required`, `defaultValue`                        |
| `slug`, `url`, `email`  | string                 | `required`; slug can declare `source`             |
| `select`, `multiselect` | option value or values | `options`, `defaultValue`                         |
| `markdown`              | string                 | Exactly one body field in a Markdown collection   |
| `object`, `list`        | nested value           | `fields` or `item`                                |

## Formats

### JSON

JSON collections store entries as ordered `.json` files. Fields serialize in
definition order, and unknown keys are rejected during validation.

### Markdown

Markdown collections store entries as `.md` files. Non-body fields live in YAML
frontmatter. Exactly one `field.markdown()` holds the document body. Dates and
datetimes stay strings so content stays portable and deterministic.

`createSlug('Building Pith')` returns `building-pith`. Use it with
`field.slug({ source: 'title' })` to auto-generate slugs from another field.
Validation never changes an existing slug.

## Read content

```tsx
// app/page.tsx
import { pith } from '@/lib/pith';

export default async function HomePage() {
  const content = await pith.content.forRequest();
  const page = await content.getEntry('pages', 'home');
  // page.value.title → string (required)
  // page.value.description → string | undefined (optional)

  return <h1>{page.value.title}</h1>;
}
```

Use `getEntry` when absence is exceptional — it throws `ContentNotFoundError`.
Use `getOptionalEntry` when absence is expected — it returns `null` for missing
entries. Both surface parse, validation, and repository errors.

## Entry order

By default `listEntries` returns entries alphabetically by identifier. To
control ordering, add a numeric field and set `order` on the collection:

```ts
// pith.config.ts
defineCollection({
  path: 'docs',
  format: 'markdown',
  order: 'position',
  fields: {
    position: field.number({ required: true }),
    title: field.text({ required: true }),
    slug: field.slug({ required: true }),
    body: field.markdown({ required: true }),
  },
});
```

```markdown
---
title: Quick start
slug: quick-start
position: 1
---

# Quick start
```

Entries with lower values appear first.

## Next

- [Storage](./storage.md) — filesystem and GitHub backends.
- [Deployment](./deployment.md) — HTTPS, secrets, and access controls.
- [Troubleshooting](./troubleshooting.md) — diagnose common setup issues.
- [Migrations](./migrations.md) — change storage or auth without changing your content files.
