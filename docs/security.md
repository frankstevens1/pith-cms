# Security

Pith protects its own boundaries. You still own your hosting, identity provider, proxy, and secrets.

## Before deployment

- Configure a precomputed Argon2id password hash or a custom `PithAuthAdapter`. Never configure a plaintext password.
- Use distinct, high-entropy session and preview secrets. Keep them out of `NEXT_PUBLIC_*`, client props, logs, and source control.
- Use HTTPS, exact trusted origins, secure production cookies, and a restrictive `frame-ancestors` policy.
- Keep CSRF and origin checks enabled for login, logout, and every mutation.
- Apply request-size limits at the proxy as well as in Pith. Do not accept multipart uploads for content mutations.
- Use persistent storage for filesystem writes. Use GitHub storage when writes must work from serverless.
- Scope GitHub credentials to one repository and only the required Contents and Pull requests permissions.
- Use a shared preview store for multi-instance unsaved previews.
- Set cache revalidation for changes made outside the current Pith app.

## What Pith handles

| Risk                | Pith control                             | Your responsibility                                      |
| ------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Editor access       | Auth adapter and server-side permissions | Choose and review identity.                              |
| Cross-site mutation | Session-bound CSRF and trusted origins   | Preserve the relevant headers through proxies.           |
| Path escape         | Logical paths and filesystem containment | Protect repository-root permissions.                     |
| Stale save          | Revision conflicts                       | Resolve changes manually; Pith will not force overwrite. |
| Preview exposure    | User-bound, expiring preview sessions    | Use HTTPS and a shared store where needed.               |
| Credential leakage  | Server-only boundaries and safe errors   | Keep credentials out of public variables and logs.       |

## Known deployment limits

The password adapter's login limit and logout revocation are process-local. So is the memory preview
store. GitHub commits and merged pull requests describe repository state, not deployment completion.

Report vulnerabilities through GitHub's private vulnerability-reporting flow. Do not include tokens,
private keys, session cookies, or full content in public issues.
