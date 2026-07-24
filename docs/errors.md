# Errors and limits

Pith errors have stable codes and safe metadata. Handle the code, not a parser or provider message.

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

- App Router and Node.js runtime only.
- Filesystem writes need one coordinated application instance and persistent storage.
- GitHub publishing follows provider permissions, rate limits, and branch protection.
- Pull-request mode creates one branch and one PR per mutation; it does not merge or clean them up.
- Preview is authenticated and short lived. The built-in store is single-instance only.
- Pith has no media handling, MDX execution, persistent drafts, autosave, collaboration, scheduling, relations, localization, webhooks, or hosted control plane.
