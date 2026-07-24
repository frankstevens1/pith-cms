# Public API status

Pith `0.1.0` is ESM-only. Import only the documented package roots and subpaths below; importing a
package's `src`, `dist`, or implementation files is unsupported.

## Stable APIs

### `@pith-cms/core`

- Configuration: `definePith`, `defineCollection`, `field`, `PithConfig`,
  `CollectionDefinition`, `FieldDefinition`, and `InferCollectionEntry`.
- Content: `createContentService`, `validateEntry`, `createDefaultEntry`, `createSlug`, and
  `getEntryPath`.
- Contracts: `ContentRepository`, repository file/write/delete types, `ContentEntry`, validation
  result types, and repository-ref/publication capability guards.
- Errors: the exported Pith domain error classes and their stable `code` values.

`parseJsonEntry`, `serializeJsonEntry`, `parseMarkdownEntry`, and `serializeMarkdownEntry` are
stable low-level serialization APIs for repository integrations. `normalizeContentPath`,
`normalizeIdentifier`, `getCollectionDirectory`, and `getIdentifierFromEntryPath` are stable
logical-path utilities; they do not resolve native filesystem paths.

### `@pith-cms/next/server`

- `createPith`, `getEntryOrNotFound`, and cache-tag helpers.
- `createPasswordAuth` and `createMemoryPreviewStore`.
- Server-facing option, content-client, editor, auth, preview, and cache types exported from the
  same entry point.

### `@pith-cms/next/password`

- `hashPassword` — generates a portable Argon2id PHC hash. This entry point is Node-only and does
  not import `server-only`. It is shared between the CLI and the password auth adapter.

### `@pith-cms/cli`

### `@pith-cms/next/preview`

- `PithPreviewBanner`.

### `@pith-cms/cli`

The `pith` binary and its documented commands (`init`, `collection add`, `content check`,
`content list`, `content read`, `doctor`, `auth hash-password`, `auth generate-secret`) are
stable. The `--json` envelope format and exit codes (0 success, 1 content failure, 2 setup
failure) are stable. The CLI does not expose a programmatic JavaScript API.

### Storage packages

- `@pith-cms/storage-filesystem`: `createFilesystemRepository` and
  `FilesystemRepositoryOptions`.
- `@pith-cms/storage-github`: `createGitHubRepository`, repository options/auth/publishing types,
  connection/publication types, and provider error classes.

`GitHubTransport` is public to support deterministic integration testing and custom corporate HTTP
transports. It is server-only and not an editor/browser API.

## Deliberately internal APIs

The schema compiler, parser implementation details, native filesystem resolver, temporary-file
helpers, GitHub request client, session encryption primitives, mutation envelope parsing, and editor
component tree are private. Consumers should use `pith.editor.page` and `pith.editor.handlers`
instead of importing editor internals. In particular, `@pith-cms/next/editor` and
`@pith-cms/storage-github/types` are intentionally not public subpaths.

## Experimental and deprecated APIs

Pith `0.1.0` exposes no experimental or deprecated APIs. Future experimental APIs will use an
explicit non-root subpath and an `experimental_` name; they will not silently appear in a stable
root export.

## Compatibility promise

Stable API fixes ship in `0.1.x`. During `0.x`, breaking stable API changes require a minor release;
additive compatible changes use a minor release; fixes use a patch release. See
[releasing](./releasing.md) and [migrations](./migrations.md).
