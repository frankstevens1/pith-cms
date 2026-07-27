# @pith-cms/next

Server-only Pith integration for Next.js App Router. Supply a validated Pith configuration and any
`ContentRepository`; this package does not choose storage or render Markdown.

```sh
pnpm add @pith-cms/core@latest @pith-cms/next@latest server-only
```

```ts
import { createPith } from '@pith-cms/next/server';

export const pith = createPith({
  config,
  repository,
  cache: { mode: 'request' },
});
```

Use `@pith-cms/next/server` only in Server Components, route handlers, metadata, and static
generation. Configured Pith instances must not enter client bundles.

## Read content

```ts
const entry = await pith.content.getEntry('posts', 'building-pith');
const optional = await pith.content.getOptionalEntry('posts', 'building-pith');
const { entries, invalidEntries } = await pith.content.listEntries('posts');
```

`getEntry` throws `ContentNotFoundError` when the file is absent. `getOptionalEntry` returns
`null` only for that case. Parse, validation, path, and repository failures remain errors.
`getEntryOrNotFound` explicitly converts only missing content into Next.js `notFound()`.

Cache modes are `request`, `no-store`, and `persistent`. Persistent canonical reads use root,
collection, and entry tags; Pith mutations invalidate affected tags. External changes still need a
revalidation interval, explicit invalidation, deployment, or future webhook.

## Editor

```tsx
// app/(cms)/layout.tsx
import '@pith-cms/next/editor.css';

// app/(cms)/pith/[[...pithPath]]/page.tsx
export default pith.editor.page;

// app/api/pith/[...pithRoute]/route.ts
export const { GET, POST, PUT, DELETE } = pith.editor.handlers;
```

Configure an auth adapter. `createPasswordAuth` verifies a precomputed Argon2id hash and creates
encrypted HttpOnly sessions. Generate a hash with the CLI:

```sh
pnpm pith auth hash-password
pnpm pith auth generate-secret
```

The editor validates permissions, CSRF, origin, content type, body size,
and repository revisions on the server. It does not force overwrite conflicts.

## Preview

Configure a separate preview secret and path resolver. Public pages that should honor previews call:

```ts
const content = await pith.content.forRequest();
```

The ordinary `pith.content` client always reads canonical storage. Preview is authenticated,
private, noindex, and short lived. The built-in memory store is for one process only; use a shared
`PithPreviewStore` across replicas.

Pith runs on the Node.js runtime. Filesystem-backed runtime writes need persistent storage. See the
[Pith guides](../../apps/docs/content/docs/quick-start.md) for setup, security, storage, and deployment limits.
