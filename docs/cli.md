---
title: CLI
slug: cli
position: 3
description: Scaffold projects, manage collections, inspect content, and diagnose setup.
---

# CLI

`@pith-cms/cli` scaffolds projects, manages collections, inspects content, and diagnoses setup.

```sh
pnpm add -D @pith-cms/cli
```

The `pith` binary runs through `pnpm pith`.

| Command                          | What it does                                            |
| -------------------------------- | ------------------------------------------------------- |
| `pith init`                      | Scaffold Pith in an existing Next.js App Router project |
| `pith collection add`            | Add a new collection interactively                      |
| `pith content check`             | Validate all entries against their schemas              |
| `pith content list <collection>` | List identifiers in a collection                        |
| `pith content read <coll> <id>`  | Read a single entry                                     |
| `pith doctor`                    | Diagnostic check of Node.js, config, and repositories   |
| `pith auth hash-password`        | Generate an Argon2id password hash                      |
| `pith auth generate-secret`      | Generate session and preview secrets                    |

All content commands and `doctor` support `--json` for machine-readable output and `--config <path>`
for a custom config location.

## Init

Scaffold a Pith integration. It detects the project root, package manager, and `app`/`src/app`
directory:

```sh
pnpm pith init
```

| Option             | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `--yes`            | Skip confirmation prompts                         |
| `--no-install`     | Generate files but skip dependency installation   |
| `--dry-run`        | Preview generated files without writing           |
| `--storage <type>` | Choose `filesystem` (default) or `github` adapter |

`init` creates `pith.config.ts`, `src/lib/pith.ts`, editor page and API routes, a content root, and
a `.env.example` block. It never mutates content entries, existing routes, layouts, or non-config
source files.

## Collection add

Add a new collection interactively. It prompts for metadata, fields, nested objects, and list
definitions, validates through `@pith-cms/core`, then writes to a managed marker block in
`pith.config.ts`:

```sh
pnpm pith collection add
```

It does not create `{}` content files — required fields would make them invalid. The editor form
creates valid entries.

## Content

### content check

Validate all content entries against their collection schemas:

```sh
pnpm pith content check
pnpm pith content check --json
```

### content list

List entry identifiers in a collection:

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

Content commands auto-detect the storage provider from `PITH_REPOSITORY_PROVIDER`:

| Value                  | Adapter                        |
| ---------------------- | ------------------------------ |
| `filesystem` (default) | `@pith-cms/storage-filesystem` |
| `github`               | `@pith-cms/storage-github`     |

## Doctor

Check Node.js compatibility, App Router detection, package installation, config loading, content-root
access, editor environment, and repository connectivity:

```sh
pnpm pith doctor
pnpm pith doctor --json
```

The doctor never prints tokens, keys, hashes, or full sensitive values.

## Auth

### hash-password

Prompts for a password and outputs an Argon2id PHC hash:

```sh
pnpm pith auth hash-password          # both formats, copy commented to clipboard
pnpm pith auth hash-password --env    # .env format with escaped $ (copied)
pnpm pith auth hash-password --live   # raw format for hosted platforms (copied)
pnpm pith auth hash-password --json
```

### generate-secret

Generates a 32-byte hex session and preview secret:

```sh
pnpm pith auth generate-secret           # both secrets, copy to clipboard
pnpm pith auth generate-secret --session # PITH_SESSION_SECRET only (copied)
pnpm pith auth generate-secret --preview # PITH_PREVIEW_SECRET only (copied)
pnpm pith auth generate-secret --json
```

## Config discovery

The CLI searches for configuration in this order:

1. `pith.config.ts`
2. `pith.config.mts`
3. `pith.config.js`
4. `pith.config.mjs`

Use `--config <path>` to specify a custom location. The config must export via `export default` or
`export const pith`.

## Environment

The CLI loads `.env.local` and `.env` with this precedence:

1. Shell environment variables (highest)
2. `.env.local`
3. `.env`

## Exit codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | Success                                                       |
| `1`  | Invalid content or failed diagnostics                         |
| `2`  | Usage error, configuration error, or repository setup failure |

## Next

- [Collections](./collections.md) — field types and validation.
- [Storage](./storage.md) — filesystem and GitHub backends.
- [Deployment](./deployment.md) — HTTPS, secrets, and access controls.
- [Troubleshooting](./troubleshooting.md) — diagnose common setup issues.
