---
title: Errors and limits
slug: errors
position: 9
description: Use stable Pith errors and know the boundaries of the current release.
---

# Errors and limits

Pith errors have stable codes and safe metadata. Handle the code, not a parser or provider message.

```ts
try {
  await pith.content.getEntry('pages', 'missing');
} catch (error) {
  if (error instanceof PithError && error.code === 'CONTENT_NOT_FOUND') {
    // return 404
  }
  throw error;
}
```

| Code                       | Meaning                                      | Usual action                                     |
| -------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `CONFIGURATION_ERROR`      | Pith or adapter setup is invalid.            | Fix configuration; do not retry.                 |
| `CONTENT_NOT_FOUND`        | A required entry file is absent.             | Use `getOptionalEntry` or explicit 404 handling. |
| `CONTENT_ALREADY_EXISTS`   | Create collided with an existing entry.      | Pick another identifier or reload.               |
| `CONTENT_PATH_ERROR`       | A logical path or identifier is unsafe.      | Fix the input; do not retry.                     |
| `CONTENT_PARSE_ERROR`      | JSON or Markdown frontmatter cannot be read. | Repair the source file.                          |
| `CONTENT_VALIDATION_ERROR` | Parsed content violates the collection.      | Use the returned field paths.                    |
| `UNSUPPORTED_FORMAT`       | The configured format is unavailable.        | Fix the collection definition.                   |
| `REPOSITORY_CONFLICT`      | The file changed since it was loaded.        | Reload and reapply changes.                      |
| `REPOSITORY_NOT_FOUND`     | A delete target disappeared.                 | Refresh the collection.                          |
| `REPOSITORY_ERROR`         | Storage failed operationally.                | Inspect safe operation metadata.                 |
| `AUTHENTICATION_ERROR`     | Session or login is invalid.                 | Sign in again; keep login failures generic.      |
| `AUTHORIZATION_ERROR`      | The session lacks a required permission.     | Change server-side permission policy.            |
| `CSRF_VALIDATION_ERROR`    | The mutation token is invalid.               | Fetch a fresh token; preserve cookies.           |
| `ORIGIN_VALIDATION_ERROR`  | The request origin is not trusted.           | Fix the deployed origin configuration.           |
| `REQUEST_VALIDATION_ERROR` | Request type, shape, or size is invalid.     | Correct the client request.                      |
| `GITHUB_RATE_LIMITED`      | GitHub declined the request for now.         | Respect retry metadata and wait.                 |

## Limits

| Area      | Limit                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | App Router and Node.js only. No Pages Router, Edge, or browser support.                                                                               |
| Storage   | Filesystem needs one coordinated instance with persistent writable disk.                                                                              |
| GitHub    | Subject to token permissions, rate limits, and branch protection.                                                                                     |
| GitHub PR | One branch + one PR per mutation. Does not merge or clean them up.                                                                                    |
| Preview   | Authenticated, short-lived. Built-in store is single-instance only.                                                                                   |
| Scope     | No media handling, MDX execution, persistent drafts, autosave, collaboration, scheduling, relations, localization, webhooks, or hosted control plane. |

## Next

- [Compatibility](./compatibility.md) — runtimes, frameworks, and deployment environments.
- [Known limitations](./known-limitations.md) — current scope boundaries and intentional omissions.
- [Public API](./public-api.md) — stable and internal API surfaces.
