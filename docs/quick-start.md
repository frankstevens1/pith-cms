# Quick start

Use filesystem storage first. It is the fastest way to run Pith locally.

The CLI can scaffold a new project:

```sh
pnpm pith init
```

Or follow the manual steps below.

## 1. Install

```sh
pnpm add @pith-cms/core @pith-cms/next @pith-cms/storage-filesystem next react react-dom server-only
```

Pith needs a Next.js App Router application running on Node.js.

## 2. Define collections

```ts
// pith.config.ts
import { defineCollection, definePith, field } from '@pith-cms/core';

export default definePith({
  contentRoot: 'content',
  collections: {
    pages: defineCollection({
      path: 'pages',
      format: 'json',
      identifierField: 'slug',
      displayField: 'title',
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ source: 'title', required: true }),
        description: field.text({ multiline: true }),
      },
    }),
  },
});
```

Create `content/pages/home.json`:

```json
{
  "title": "Home",
  "slug": "home",
  "description": "A Pith site."
}
```

## 3. Create Pith

Generate an Argon2id hash and a session secret:

```sh
pnpm pith auth hash-password
pnpm pith auth generate-secret
```

Set those values plus a separate preview secret in server-only environment variables.

```ts
// src/lib/pith.ts
import { createPith, createMemoryPreviewStore, createPasswordAuth } from '@pith-cms/next/server';
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

import config from '../../pith.config';

export const pith = createPith({
  config,
  repository: createFilesystemRepository({ rootDirectory: process.cwd() }),
  auth: createPasswordAuth({
    passwordHash: process.env.PITH_PASSWORD_HASH!,
    sessionSecret: process.env.PITH_SESSION_SECRET!,
  }),
  editor: { basePath: '/pith' },
  preview: {
    secret: process.env.PITH_PREVIEW_SECRET!,
    store: createMemoryPreviewStore(),
    resolvePath: ({ collection, identifier }) =>
      collection === 'pages' && identifier === 'home' ? '/' : null,
  },
});
```

`createMemoryPreviewStore()` is for one process. Use a shared `PithPreviewStore` across replicas.

## 4. Mount the editor

```tsx
// app/layout.tsx
import '@pith-cms/next/editor.css';

// app/pith/[[...pithPath]]/page.tsx
import { pith } from '@/lib/pith';
export default pith.editor.page;

// app/api/pith/[...pithRoute]/route.ts
import { pith } from '@/lib/pith';
export const { GET, POST, PUT, DELETE } = pith.editor.handlers;
```

## 5. Read content

Use `forRequest()` only on public pages that should render an authenticated preview.

```tsx
const content = await pith.content.forRequest();
const page = await content.getEntry('pages', 'home');
```

Run `pnpm dev`, visit `/`, then sign in at `/pith`.

Next: [collections](./collections.md), [editor and preview](./editor.md), [storage](./storage.md), or [CLI](./cli.md).
