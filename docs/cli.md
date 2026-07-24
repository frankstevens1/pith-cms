# CLI

`@pith-cms/cli` scaffolds projects, manages collections, inspects content, and diagnoses setup. Install it as a dev dependency:

```sh
pnpm add -D @pith-cms/cli
```

The `pith` binary runs through `pnpm pith` (or the equivalent for your package manager).

## Init

Scaffold a Pith integration in an existing Next.js App Router project. It detects the project root,
package manager, and `app`/`src/app` directory, then generates a minimal integration:

```sh
pnpm pith init
```

It creates `pith.config.ts` with an initial `pages` collection, a server instance at
`src/lib/pith.ts`, editor page and API routes, and a content root. When a `.env.example` exists,
it appends a marked Pith block without touching existing entries.

| Option             | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `--yes`            | Skip confirmation prompts                         |
| `--no-install`     | Generate files but skip dependency installation   |
| `--dry-run`        | Preview generated files without writing           |
| `--storage <type>` | Choose `filesystem` (default) or `github` adapter |

The init command does not mutate content entries, existing application routes, layouts, or
non-config source files. Generated code uses explicit, ordinary TypeScript with clearly marked
imports and collection regions.

## Collection add

Add a new collection interactively. It prompts for metadata, every existing field type, nested
objects, and recursive list definitions, validates the definition through `@pith-cms/core`, then
writes it to a managed marker block in `pith.config.ts` and creates the content directory:

```sh
pnpm pith collection add
```

It deliberately does not create `{}` content files because required fields would make them
invalid. The editor form creates valid entries.

When an existing config has unmanaged (static) collection definitions, `init` shows a warning
and asks for confirmation before adopting. Dynamic or non-literal configurations fail safely
with manual migration guidance.

## Content

Inspect content through filesystem or GitHub storage. All commands support `--json` for
machine-readable output and `--config <path>` to specify a custom config location.

### content check

Validate all content entries against their collection schemas:

```sh
pnpm pith content check
pnpm pith content check --json
```

### content list

List entries in a collection:

```sh
pnpm pith content list pages
pnpm pith content list pages --json
```

### content read

Read a single entry:

```sh
pnpm pith content read pages home
pnpm pith content read pages home --json
```

The content commands use the existing content service and repository adapters from `@pith-cms/core`
and the storage packages. They support the `PITH_REPOSITORY_PROVIDER` and `PITH_GITHUB_*`
environment variable convention for selecting and configuring storage.

## Doctor

Check Node.js compatibility, App Router detection, package installation, config loading and
validation, managed collection markers, content-root access, editor environment, and repository
connectivity. It calls `verifyConnection()` when GitHub storage is selected:

```sh
pnpm pith doctor
pnpm pith doctor --json
```

The doctor never prints tokens, keys, hashes, or full sensitive values. Each finding includes a
diagnostic code and remediation guidance.

## Auth

Generate authentication material without accepting secrets as command-line arguments.

### hash-password

Prompts for a password and outputs an Argon2id PHC hash compatible with `createPasswordAuth`:

```sh
pnpm pith auth hash-password
pnpm pith auth hash-password --json
```

### generate-secret

Generates a 32-byte hex session secret:

```sh
pnpm pith auth generate-secret
pnpm pith auth generate-secret --json
```

## Config discovery

The CLI discovers configuration by searching for (in order):

1. `pith.config.ts`
2. `pith.config.mts`
3. `pith.config.js`
4. `pith.config.mjs`

Use `--config <path>` to specify a custom location. The config must export a Pith config via
`export default` or `export const pith`.

## Environment

The CLI loads `.env.local` and `.env` with the following precedence:

1. Shell environment variables (highest)
2. `.env.local`
3. `.env`

## Exit codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | Success                                                       |
| `1`  | Invalid content or failed diagnostics                         |
| `2`  | Usage error, configuration error, or repository setup failure |

## Repository support

Content commands auto-detect the storage provider from `PITH_REPOSITORY_PROVIDER`:

| Value                  | Adapter                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `filesystem` (default) | `@pith-cms/storage-filesystem` rooted at the project directory      |
| `github`               | `@pith-cms/storage-github` configured via `PITH_GITHUB_*` variables |

GitHub storage supports both `direct` and `pull-request` publishing modes as well as personal
access token and GitHub App authentication. The CLI loads the adapters dynamically; they need
not be direct dependencies of the project.
