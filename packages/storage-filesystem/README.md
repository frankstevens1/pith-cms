# @pith-cms/storage-filesystem

Node.js implementation of Pith's `ContentRepository`. It stores opaque UTF-8 content; collections,
parsing, validation, and serialization stay in `@pith-cms/core`.

```ts
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

const repository = createFilesystemRepository({ rootDirectory: process.cwd() });
```

The root must exist. Every path stays logical and relative, such as
`content/pages/home.json`; native absolute paths never appear in results.

- Reads return `null` only for a missing file.
- Revisions are opaque `sha256:` content hashes for optimistic concurrency.
- Writes create parents safely, flush a same-directory temporary file, and atomically rename it.
- Lists are direct, sorted, and omit Pith temporary files.
- Absolute paths, traversal, Windows path forms, null bytes, and symbolic links are rejected.

Use it for local development, CI, Docker volumes, and one self-hosted Node.js process. It is not
durable for serverless, Edge, read-only, or uncoordinated multi-replica writes.

> The filesystem adapter requires persistent writable storage for content mutations.

See the [storage guide](../../apps/docs/content/docs/storage.md) for choosing an adapter.
