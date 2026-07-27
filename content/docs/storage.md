---
title: Storage and publishing
slug: storage
position: 5
description: Choose a persistent filesystem or GitHub commits and pull requests.
---

# Storage and publishing

The content model stays the same. Replace the repository adapter when the deployment changes.

| Mode                | Use it when                                               | Result                              |
| ------------------- | --------------------------------------------------------- | ----------------------------------- |
| Filesystem          | Local development or a single server with a writable disk | Direct file writes                  |
| GitHub direct       | Commit directly to your main branch from the editor       | One commit per save                 |
| GitHub pull request | A team or protected branch that needs review              | One branch, commit, and PR per save |

## Filesystem

```ts
// src/lib/pith.ts
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

const repository = createFilesystemRepository({ rootDirectory: process.cwd() });
```

The filesystem adapter uses paths relative to your content directory, blocks traversal attacks,
detects changes via content hashing, and writes files safely (a write completes fully or not at all).
It will not work on serverless platforms, read-only filesystems, Edge runtimes, or across multiple
servers without shared storage.

## GitHub

```env
# .env
PITH_GITHUB_OWNER=my-org
PITH_GITHUB_REPOSITORY=my-site
PITH_GITHUB_BRANCH=main
PITH_GITHUB_TOKEN=ghp_...
```

```ts
// src/lib/pith.ts
import { createGitHubRepository } from '@pith-cms/storage-github';

const repository = createGitHubRepository({
  owner: process.env.PITH_GITHUB_OWNER!,
  repository: process.env.PITH_GITHUB_REPOSITORY!,
  branch: process.env.PITH_GITHUB_BRANCH || 'main',
  auth: { token: process.env.PITH_GITHUB_TOKEN! },
  publishing: { mode: 'pull-request', branchPrefix: 'pith/' },
});
```

The adapter maps Pith's logical paths directly to your repository root. A collection
with `contentRoot: 'content'` and `path: 'pages'` resolves to `content/pages/`
at the repository root — not relative to any app directory.

In a monorepo where content lives inside `apps/my-site/content/`, either place
content at the repo root or set `contentRoot: 'apps/my-site/content'` in your
config.

| Auth method    | Use when                          |
| -------------- | --------------------------------- |
| Personal token | Development, fine-grained scopes  |
| GitHub App     | Production, org-wide installation |

Direct mode needs `Contents: Read and write` and `Metadata: Read`. Pull-request mode also needs
`Pull requests: Read and write`.

Pith calls the GitHub API directly. No local git clone, no database, no persistent workspace needed.
Conflicts are detected: if a file changed since you last read it, your write is rejected rather than
silently overwriting changes.

## What publication means

Filesystem writes are saved locally. A GitHub direct write is committed. A pull request is review
pending until merged. None of those states proves a hosting provider deployed the site.

## Next

- [Deployment](./deployment.md) — HTTPS, secrets, and access controls.
- [Troubleshooting](./troubleshooting.md) — diagnose common setup issues.
- [Migrations](./migrations.md) — change storage or auth without changing your content files.
- [Errors](./errors.md) — stable error codes and system boundaries.
