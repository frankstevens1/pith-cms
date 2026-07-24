# Storage and publishing

The content model stays the same. Replace the repository adapter when the deployment changes.

| Mode                | Use it when                                                                  | Result                                  |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| Filesystem          | Local development or one self-hosted Node.js server with a persistent volume | Direct UTF-8 file writes                |
| GitHub direct       | A simple production site can write its base branch                           | One commit per mutation                 |
| GitHub pull request | A team or protected branch needs review                                      | One branch, commit, and PR per mutation |

## Filesystem

```ts
import { createFilesystemRepository } from '@pith-cms/storage-filesystem';

const repository = createFilesystemRepository({ rootDirectory: process.cwd() });
```

The adapter accepts only logical relative paths, rejects traversal and symlinks, hashes content for
revisions, and replaces files atomically. It is not durable on serverless, read-only, Edge, or
uncoordinated multi-replica deployments.

## GitHub

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

Use a server-only fine-grained token for controlled development, or a GitHub App installation for
production. Direct mode needs `Contents: Read and write` and `Metadata: Read`. Pull-request mode
also needs `Pull requests: Read and write`.

GitHub revisions are file SHAs. Stale writes and deletes fail instead of overwriting. GitHub storage
uses APIs directly: no checkout, local Git process, database, or persistent workspace is required.

## What publication means

Filesystem writes are saved locally. A GitHub direct write is committed. A pull request is review
pending until merged. None of those states proves a hosting provider deployed the site.
