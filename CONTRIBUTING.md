# Contributing to Pith

## Local setup

Pith requires Node.js 24.7 or later and pnpm 11 or later.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The monorepo contains public packages under `packages/`, consumer applications under `apps/`, and
shared build/lint configuration under `tooling/`. `@pith-cms/core` owns content semantics;
`@pith-cms/next` owns Next.js/editor integration; storage adapters implement only repository access.
Do not import another package through `src` or `dist` paths.

## Before opening a pull request

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:content
pnpm pack:check
pnpm test:e2e
```

Add targeted tests for non-trivial behavior and update public documentation in the same change.
User-facing changes to public packages require a Changeset:

```sh
pnpm changeset
```

Do not add a Changeset for documentation-only, CI-only, or internal tooling changes unless it affects
published behavior. Do not include secrets, test credentials, or internal source imports in examples.

## Pull requests

Keep diffs focused, explain public API and compatibility impact, state the verification run, and call
out security or deployment implications. Follow the repository pull-request template.

## Security reporting

Before making the repository public, a repository administrator must enable GitHub private
vulnerability reporting in **Settings → Advanced Security → Private vulnerability reporting**.
Confirm that at least one maintainer watches the repository's **Security alerts** notifications so
new reports are received. Researchers can then use **Report a vulnerability** from the repository's
Security tab; do not ask them to open a public issue.
