# Migrations

Pith keeps content files and collection definitions portable. Most migrations replace configuration, not content.

## Filesystem to GitHub

Replace only the repository passed to `createPith`:

```ts
import { createGitHubRepository } from '@pith-cms/storage-github';

const repository = createGitHubRepository({
  owner: process.env.PITH_GITHUB_OWNER!,
  repository: process.env.PITH_GITHUB_REPOSITORY!,
  branch: 'main',
  auth: { token: process.env.PITH_GITHUB_TOKEN! },
  publishing: { mode: 'pull-request', branchPrefix: 'pith/' },
});
```

Your JSON and Markdown files stay unchanged. Re-check content paths, branch protection, and GitHub permissions.

## Direct commits to pull requests

Change `publishing.mode` to `pull-request`. Each mutation creates one branch and one pull request.
The canonical site continues to read the base branch until merge.

## Password auth to custom auth

Replace `createPasswordAuth(...)` with a `PithAuthAdapter`. Preserve server-side permission checks,
CSRF protection, origin validation, and short-lived sessions.

## Request cache to persistent cache

Set `cache: { mode: 'persistent', revalidate: 300 }`. Canonical Pith mutations invalidate tags;
external changes still need timed or explicit invalidation.

## Memory previews to a shared store

Pass a durable `PithPreviewStore` through `preview.store`. Do not copy unsaved content into cookies,
URLs, or browser storage.
