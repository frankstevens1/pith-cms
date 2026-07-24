# Collections

A collection defines the schema, serialization format, and storage path for a group of content
entries. Content lives in collections — before reading content, define your collection schemas
here.

Collections are the source of truth for inferred TypeScript values, runtime validation, defaults, and editor controls.

## Define once

```ts
import { defineCollection, definePith, field } from '@pith-cms/core';

const posts = defineCollection({
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
});

export default definePith({
  contentRoot: 'content',
  collections: { posts },
});
```

`InferCollectionEntry<typeof posts>` gives the entry type. Required fields remain required; optional
fields stay optional; nested objects and lists infer recursively.

## Fields

| Field                   | Value                  | Useful options                                    |
| ----------------------- | ---------------------- | ------------------------------------------------- |
| `text`                  | string                 | `required`, `minLength`, `maxLength`, `multiline` |
| `number`                | number                 | `min`, `max`, `integer`                           |
| `boolean`               | boolean                | `defaultValue`                                    |
| `date`                  | `YYYY-MM-DD` string    | `required`, `defaultValue`                        |
| `datetime`              | UTC ISO 8601 string    | `required`, `defaultValue`                        |
| `slug`, `url`, `email`  | string                 | `required`; slug can declare `source`             |
| `select`, `multiselect` | option value or values | `options`, `defaultValue`                         |
| `markdown`              | string                 | exactly one body field in a Markdown collection   |
| `object`, `list`        | nested value           | `fields` or `item`                                |

## Files

JSON fields serialize in collection order and reject unknown keys. Markdown stores non-body fields in
YAML frontmatter and exactly one `markdown` value as the body. Dates and datetimes stay strings so
content stays portable and deterministic.

`createSlug('Building Pith')` returns `building-pith`. Validation never changes an existing slug.

## Read content

```ts
const page = await pith.content.getEntry('pages', 'home');
const optional = await pith.content.getOptionalEntry('pages', 'home');
const { entries, invalidEntries } = await pith.content.listEntries('posts');
```

Use `getEntry` when absence is exceptional. `getOptionalEntry` returns `null` only for missing files;
parse, validation, and repository errors still surface.
