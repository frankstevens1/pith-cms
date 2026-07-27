# @pith-cms/storage-github

GitHub Contents API storage for Pith. It preserves UTF-8 content, uses file SHAs as revisions, and
never clones a repository or runs a local Git process.

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

Use a server-only fine-grained token for controlled development or a GitHub App installation for
production. Direct publishing needs `Contents: Read and write` and `Metadata: Read`; pull-request
mode also needs `Pull requests: Read and write`.

## Publishing modes

| Mode           | Result                                                          |
| -------------- | --------------------------------------------------------------- |
| `direct`       | Commits the supplied Pith mutation to the configured branch     |
| `pull-request` | Creates one sanitized branch, one commit, and one reviewable PR |

Stale writes and deletes fail with `RepositoryConflictError`. PR mode leaves the base branch
unchanged until merge. A commit or merged PR does not prove deployment completed.

The adapter is Node.js-only and works from serverless because it calls GitHub directly. It rejects
unsafe paths, directories, unsupported Git object types, binary content, and oversized files.

Use `await repository.verifyConnection()` in a server-side diagnostic when you need to check the
repository, branch, and capabilities. See the [storage guide](../../apps/docs/content/docs/storage.md) for deployment
and preview constraints.
