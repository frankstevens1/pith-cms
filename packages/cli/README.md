# @pith-cms/cli

Command-line scaffolding, collection management, content inspection, and diagnostics for Pith.

## Installation

```bash
pnpm add -D @pith-cms/cli
```

## Commands

### `pith init`

Scaffold a Pith integration in an existing Next.js App Router project.

```bash
pnpm pith init
```

Options:

- `--yes` — Skip confirmation prompts
- `--no-install` — Skip dependency installation
- `--dry-run` — Preview changes without writing
- `--storage <filesystem|github>` — Storage adapter (default: filesystem)

### `pith collection add`

Add a new collection definition interactively.

```bash
pnpm pith collection add
```

### `pith content check`

Validate all content entries against their collection schemas.

```bash
pnpm pith content check
pnpm pith content check --json
```

### `pith content list <collection>`

List all entries in a collection.

```bash
pnpm pith content list pages
pnpm pith content list pages --json
```

### `pith content read <collection> <identifier>`

Read and display a single content entry.

```bash
pnpm pith content read pages home
pnpm pith content read pages home --json
```

### `pith doctor`

Diagnose the Pith setup and report issues.

```bash
pnpm pith doctor
pnpm pith doctor --json
```

### `pith auth`

Generate authentication material.

```bash
pnpm pith auth hash-password
pnpm pith auth generate-secret
```

## Configuration Discovery

The CLI discovers configuration by searching for (in order):

1. `pith.config.ts`
2. `pith.config.mts`
3. `pith.config.js`
4. `pith.config.mjs`

Use `--config <path>` to specify a custom location.

## Environment

The CLI loads `.env.local` and `.env` with the following precedence:

1. Shell environment variables (highest)
2. `.env.local`
3. `.env`

## Exit Codes

- `0` — Success
- `1` — Invalid content or failed diagnostics
- `2` — Usage error, configuration error, or repository setup failure
