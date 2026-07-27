---
title: Migrations
slug: migrations
position: 8
description: Change storage or auth without changing your content files.
---

# Migrations

Pith keeps content files and collection definitions portable. Most migrations replace configuration,
not content.

## Switch to GitHub storage

Replace the repository passed to `createPith`. Your JSON and Markdown files stay unchanged:

```ts
// src/lib/pith.ts — before
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

const repository = createFilesystemRepository({ rootDirectory: process.cwd() });

// src/lib/pith.ts — after
import { createGitHubRepository } from '@pith-cms/storage-github';

const repository = createGitHubRepository({
  owner: process.env.PITH_GITHUB_OWNER!,
  repository: process.env.PITH_GITHUB_REPOSITORY!,
  branch: process.env.PITH_GITHUB_BRANCH || 'main',
  auth: { token: process.env.PITH_GITHUB_TOKEN! },
  publishing: { mode: 'pull-request', branchPrefix: 'pith/' },
});
```

Re-check content paths, branch protection, and GitHub permissions after the switch.

## Switch to pull-request publishing

Change `publishing.mode` from `'direct'` to `'pull-request'`:

```ts
// src/lib/pith.ts
const repository = createGitHubRepository({
  // ... same owner, repo, branch, auth
  publishing: { mode: 'pull-request', branchPrefix: 'pith/' },
});
```

Each mutation creates one branch and one pull request. The canonical site continues to read the base
branch until merge.

## Switch to a custom auth adapter

Replace `createPasswordAuth` with an adapter implementing `PithAuthAdapter`:

```ts
// src/lib/pith.ts — before
import { createPasswordAuth } from '@pith-cms/next/server';
const auth = createPasswordAuth({
  passwordHash: process.env.PITH_PASSWORD_HASH!,
  sessionSecret: process.env.PITH_SESSION_SECRET!,
});

// src/lib/pith.ts — after
import { myAuthAdapter } from './my-auth-adapter';
const auth = myAuthAdapter;
```

Preserve server-side permission checks, CSRF protection, origin validation, and short-lived sessions
in your adapter.

## Switch to persistent cache

Add `cache` to `createPith`. Canonical Pith mutations invalidate tags; external changes need timed
revalidation:

```ts
// src/lib/pith.ts
export const pith = createPith({
  config,
  repository,
  cache: { mode: 'persistent', revalidate: 300 },
});
```

## Switch to a shared preview store

Replace the default memory store with a durable implementation:

```ts
// src/lib/pith.ts — before
import { createMemoryPreviewStore } from '@pith-cms/next/server';
const previewStore = createMemoryPreviewStore();

// src/lib/pith.ts — after
import { myPreviewStore } from './my-preview-store';
const previewStore = myPreviewStore;
```

Do not copy unsaved content into cookies, URLs, or browser storage.

## Next

- [Errors](./errors.md) — stable error codes and system boundaries.
- [Compatibility](./compatibility.md) — runtimes, frameworks, and deployment environments.
- [Known limitations](./known-limitations.md) — current scope boundaries and intentional omissions.
- [Public API](./public-api.md) — stable and internal API surfaces.
