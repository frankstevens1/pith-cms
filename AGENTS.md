# AGENTS.md

Files-first CMS toolkit for Next.js App Router. pnpm + Turborepo monorepo, ESM-only, Node ≥ 24.7 (see `.nvmrc`), pnpm 11 via `corepack enable`.

## Layout

- `packages/` — publishable packages: `@pith-cms/core` (content model, validation, serialization, repository contracts), `@pith-cms/next` (Next.js reads, editor, preview), `@pith-cms/cli`, `@pith-cms/storage-filesystem`, `@pith-cms/storage-github`.
- `apps/playground` — dev/demo Next.js app (port 3100) with real content in `apps/playground/content`; used by e2e and `test:content`.
- `apps/docs` — docs site (port 3101) rendering the Markdown in `apps/docs/content/docs/`.
- `tests/repository-contract.ts` — shared behavioral contract every storage adapter must pass; both adapters import it from their `test/` dirs. New adapters must run it too.
- `tests/package-smoke` — fixture consumed by `pnpm pack:check`.
- `tooling/` — shared tsconfig and eslint config.

## Dependency boundaries (enforced)

`pnpm lint` also runs `check:boundaries` (`scripts/verify-package-boundaries.mjs`). Allowed `@pith-cms/*` deps: core → none; next → core; storage-* → core; cli → all. Never import another package via `src`/`dist` paths or relative `../packages/...` — the script fails the build. Docs may only reference the subpaths whitelisted in `scripts/verify-documentation.mjs` (checked by `pnpm check:docs`).

## Commands

- Verify before finishing (CI order): `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Single package: `pnpm --filter @pith-cms/core test` (same for `build`/`typecheck`/`lint`).
- Single test file/name: `pnpm --filter @pith-cms/core exec vitest run test/foo.test.ts -t "name"`.
- **Tests resolve `@pith-cms/*` imports through workspace deps → `dist/`.** Turbo's `test` task `dependsOn: build` handles this, but when running vitest directly in a dependent package (e.g. storage-*) after editing `@pith-cms/core`, rebuild first: `pnpm --filter @pith-cms/core build`.
- `pnpm test:content` — runs `pith content check` against the playground content.
- `pnpm pack:check` — packs all packages and installs the tarballs into a clean Next.js fixture; use after changing package `exports`/`files` or build output.
- `pnpm test:e2e` — Playwright, chromium only, fully sequential (editor tests mutate one shared content tree). First run needs `pnpm exec playwright install --with-deps chromium`. Config boots its own servers on 3100/3101; don't run a dev server on those ports concurrently.

## Conventions

- Prettier is enforced (`pnpm format`); eslint requires separate `import type` statements (`consistent-type-imports`, `fixStyle: separate-type-imports`).
- Packages are built with tsup; `@pith-cms/next`'s build additionally copies `src/editor.css` into `dist/` — `pack:check` asserts it ships.
- User-facing changes to published packages need a Changeset (`pnpm changeset`); docs/CI/tooling-only changes do not.
- Public API or behavior changes must update `content/docs/` in the same change (CI runs `check:docs`).
- Storage adapters implement only the `ContentRepository` contract from `@pith-cms/core`; keep adapter-specific behavior in the adapter, semantics in core.
- No telemetry, no CommonJS, no Edge/browser runtime targets — don't add them.
