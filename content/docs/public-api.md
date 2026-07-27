---
title: Public API status
slug: public-api
position: 12
description: Stable and internal API surfaces, plus the compatibility promise.
---

# Public API status

Pith `0.1.0` is ESM-only. Import only the documented package roots and subpaths below. Importing a
package's `src`, `dist`, or implementation files is unsupported.

## Stable APIs

### `@pith-cms/core`

```ts
import { definePith, defineCollection, field } from '@pith-cms/core';
import type { InferCollectionEntry, PithConfig } from '@pith-cms/core';
```

| Category       | Exports                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Configuration  | `definePith`, `defineCollection`, `field`, `PithConfig`, `CollectionDefinition`, `FieldDefinition`, `InferCollectionEntry` |
| Content        | `createContentService`, `validateEntry`, `createDefaultEntry`, `createSlug`, `getEntryPath`                                |
| Serialization  | `parseJsonEntry`, `serializeJsonEntry`, `parseMarkdownEntry`, `serializeMarkdownEntry`                                     |
| Path utilities | `normalizeContentPath`, `normalizeIdentifier`, `getCollectionDirectory`, `getIdentifierFromEntryPath`                      |
| Contracts      | `ContentRepository`, `ContentEntry`, repository file/write/delete types, validation result types, capability guards        |
| Errors         | Pith domain error classes and their stable `code` values                                                                   |

Path utilities resolve logical paths — they do not resolve native filesystem paths.

### `@pith-cms/next/server`

```ts
import {
  createPith,
  createPasswordAuth,
  createMemoryPreviewStore,
  getEntryOrNotFound,
} from '@pith-cms/next/server';
```

| Export                     | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `createPith`               | Wire config, repository, auth, editor, preview, and cache |
| `createPasswordAuth`       | Argon2id-based editor authentication                      |
| `createMemoryPreviewStore` | Single-process preview store                              |
| `getEntryOrNotFound`       | Content fetch that throws a typed 404                     |

Server-facing option, content-client, editor, auth, preview, and cache types are exported from the
same entry point.

### `@pith-cms/next/password`

```ts
import { hashPassword } from '@pith-cms/next/password';
// => portable Argon2id PHC hash string
```

Node-only. Does not import `server-only`. Shared between the CLI and `createPasswordAuth`.

### `@pith-cms/next/preview`

```ts
import { PithPreviewBanner } from '@pith-cms/next/preview';
```

### `@pith-cms/cli`

The `pith` binary and its documented commands are stable. The `--json` envelope format and exit codes
(`0` success, `1` content failure, `2` setup failure) are stable. The CLI does not expose a
programmatic JavaScript API.

### `@pith-cms/storage-filesystem`

```ts
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';
```

`FilesystemRepositoryOptions` is also stable.

### `@pith-cms/storage-github`

```ts
import { createGitHubRepository } from '@pith-cms/storage-github';
```

`GitHubTransport`, repository options/auth/publishing types, connection/publication types, and
provider error classes are stable. `GitHubTransport` is server-only and not an editor/browser API.

## Deliberately internal APIs

| Internal area                    | Use instead                                |
| -------------------------------- | ------------------------------------------ |
| Editor component tree            | `pith.editor.page`, `pith.editor.handlers` |
| Schema compiler                  | `defineCollection`, `InferCollectionEntry` |
| Parser implementation            | `parseJsonEntry`, `parseMarkdownEntry`     |
| Session encryption               | `createPasswordAuth`                       |
| `@pith-cms/next/editor`          | Not a public subpath — do not import       |
| `@pith-cms/storage-github/types` | Not a public subpath — do not import       |

## Experimental and deprecated APIs

Pith `0.1.0` exposes no experimental or deprecated APIs. Future experimental APIs will use an
explicit non-root subpath and an `experimental_` name; they will not silently appear in a stable
root export.

## Compatibility promise

Stable API fixes ship in `0.1.x`. During `0.x`, breaking stable API changes require a minor release;
additive compatible changes use a minor release; fixes use a patch release. See
[migrations](./migrations.md).

## Next

- [Error codes](./errors.md) — stable error codes and retry guidance.
- [Known limitations](./known-limitations.md) — current scope boundaries and intentional omissions.
