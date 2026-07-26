# Pith

Pith is a files-first CMS toolkit for Next.js App Router sites. Define typed content, keep JSON and
Markdown in your repository, and add a protected editor when the site needs one.

> `0.1.0` is the first planned public release. Pith is ESM-only and runs on the Node.js runtime.

## Install

```sh
pnpm add @pith-cms/core@latest @pith-cms/next@latest @pith-cms/storage-filesystem@latest next react react-dom server-only
```

Start with the [quick start](docs/quick-start.md). It defines a collection, mounts `/pith`, and
reads a page in a Server Component.

## Packages

- `@pith-cms/core` — collections, fields, validation, serialization, and repository contracts.
- `@pith-cms/next` — server-only content reads, protected editor, preview, and cache helpers.
- `@pith-cms/cli` — scaffolding, collection management, content inspection, and diagnostics.
- `@pith-cms/storage-filesystem` — persistent local/self-hosted UTF-8 file storage.
- `@pith-cms/storage-github` — GitHub commits and pull requests without a local checkout.

```ts
const page = await pith.content.getEntry('pages', 'home');
```

Field definitions drive both inferred TypeScript values and runtime validation. Content is ordered
JSON or Markdown with frontmatter; unknown keys are rejected.

## Choose storage

| Storage             | Use it for                                                                     | Do not use it for                                                        |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Filesystem          | Local development and one self-hosted Node.js process with a persistent volume | Durable writes on serverless, read-only, Edge, or uncoordinated replicas |
| GitHub direct       | Simple production publishing to a writable branch                              | Protected branches that require review                                   |
| GitHub pull request | Reviewable team publishing                                                     | Automatic merge, deploy confirmation, or long-lived drafts               |

Changing adapters does not change content files.

## Editor and preview

The opt-in editor validates, serializes, creates, updates, and deletes through the configured
repository. It uses server-side permissions, CSRF, origin checks, request limits, and revisions.
Unsaved preview is authenticated, short lived, private, and never puts content in URLs or cookies.

Use a shared preview store and custom auth adapter outside one process. GitHub commits and merged
pull requests describe repository state; Pith never claims a site has deployed.

## Requirements and limits

- Next.js App Router and Node.js only; no Pages Router, Edge Runtime, CommonJS, or browser runtime.
- No hosted Pith service, media management, MDX execution, autosave, collaboration, scheduling, or webhooks.
- Pith sends no telemetry, analytics, or automatic error reports.

## Documentation

- [Quick start](docs/quick-start.md)
- [Collections](docs/collections.md)
- [Editor and preview](docs/editor.md)
- [Storage and publishing](docs/storage.md)
- [CLI](docs/cli.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Errors and limits](docs/errors.md)
- [Migrations](docs/migrations.md)

## Development

```sh
corepack enable
pnpm install
pnpm dev
```

Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` before release.
Use `pnpm pack:check` to verify packed packages in a clean Next.js fixture.

See [CONTRIBUTING.md](CONTRIBUTING.md), and [SUPPORT.md](SUPPORT.md).

## License

[MIT](LICENSE) © 2026 Pith contributors.
