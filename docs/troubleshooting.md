---
title: Troubleshooting
slug: troubleshooting
position: 7
description: Diagnose setup, storage, preview, and security failures directly.
---

# Troubleshooting

Start with `pnpm pith doctor` for an automated diagnostic. It checks Node.js, App Router, packages,
config, content-root, editor setup, and repository connectivity without printing sensitive values.

Start with the stable error code. Do not disable a security control to make a configuration problem
disappear.

## Editor

| Problem                     | Check                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Editor route is 404         | Mount `pith.editor.page` at `app/(cms)/pith/[[...pithPath]]/page.tsx`                         |
| Editor styles are missing   | Verify `import '@pith-cms/next/editor.css'` is present in `app/(cms)/layout.tsx`              |
| Server code leaks to client | Create the instance only through `@pith-cms/next/server`. Pass selected values through props. |

## Auth and sessions

| Problem              | Check                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Login always fails   | Use an Argon2id hash, not a plaintext password. Escape `$` only in a Next.js `.env` file. |
| Session is not set   | Use HTTPS in production and confirm the origin matches the browser origin.                |
| CSRF or origin fails | Fetch a fresh token and add the exact deployed origin to `trustedOrigins`.                |

## Content

| Problem                   | Check                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Content is missing        | Verify collection path, identifier, file extension, and deployed content directory.                   |
| JSON or frontmatter fails | Read the `CONTENT_PARSE_ERROR` or `CONTENT_VALIDATION_ERROR` path. Unknown fields are rejected.       |
| Cache looks stale         | Canonical mutations invalidate tags. External changes wait for revalidation, invalidation, or deploy. |

## Storage

| Problem               | Check                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Filesystem save fails | The process needs a persistent writable volume. Serverless and read-only filesystems are not durable storage.                         |
| GitHub write fails    | Check token/App permissions, branch protection, repository name, branch, and rate-limit response. Use PR mode for protected branches. |

## Preview

| Problem                       | Check                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Preview expires or disappears | Configure a valid preview secret. Use a shared store outside a single process. |

See [errors](./errors.md) for stable codes and retry guidance.

## Next

- [Migrations](./migrations.md) — change storage or auth without changing your content files.
- [Errors](./errors.md) — stable error codes and system boundaries.
- [Compatibility](./compatibility.md) — runtimes, frameworks, and deployment environments.
- [Known limitations](./known-limitations.md) — current scope boundaries and intentional omissions.
