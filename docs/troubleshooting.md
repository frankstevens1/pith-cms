# Troubleshooting

Start with `pnpm pith doctor` for an automated diagnostic. It checks Node.js, App Router,
packages, config, content-root, editor setup, and repository connectivity without printing
sensitive values.

Start with the stable error code. Do not disable a security control to make a configuration problem disappear.

| Problem                               | Check                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Editor route is 404                   | Mount `pith.editor.page` at `app/pith/[[...pithPath]]/page.tsx`.                                                                      |
| Login always fails                    | Use an Argon2id hash, not a plaintext password. Escape `$` only in a Next.js `.env` file.                                             |
| Session is not set                    | Use HTTPS in production and confirm the configured origin matches the browser origin.                                                 |
| CSRF or origin fails                  | Fetch a fresh token and add the exact deployed origin to `trustedOrigins`. Do not trust arbitrary forwarded hosts.                    |
| Content is missing                    | Check the collection path, identifier, extension, and deployed content directory.                                                     |
| JSON or frontmatter fails             | Read the `CONTENT_PARSE_ERROR` or `CONTENT_VALIDATION_ERROR` path; unknown fields are rejected.                                       |
| Filesystem save fails                 | The process needs a persistent writable volume. Serverless and read-only deployment filesystems are not durable storage.              |
| GitHub write fails                    | Check token/App permissions, branch protection, repository name, branch, and rate-limit response. Use PR mode for protected branches. |
| Preview expires or disappears         | Configure a valid preview secret; use a shared store outside a single process.                                                        |
| Cache looks stale                     | Canonical mutations invalidate tags. External changes wait for revalidation, explicit invalidation, or a deployment.                  |
| Editor styles are missing             | Import `@pith-cms/next/editor.css` once from the application layout.                                                                  |
| Server code enters a client component | Create the configured instance only through `@pith-cms/next/server`; pass selected values through props.                              |

See [errors](./errors.md) for stable codes and retry guidance.
