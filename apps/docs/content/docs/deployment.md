---
title: Deployment
slug: deployment
position: 6
description: Deploy Pith securely with HTTPS, secrets management, and access controls.
---

# Deployment

Pith protects its own boundaries. You still own your hosting, identity provider, proxy, and secrets.

## Environment variables

These are the core variables Pith reads at runtime:

| Variable              | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `PITH_PASSWORD_HASH`  | Precomputed Argon2id hash for editor login               |
| `PITH_SESSION_SECRET` | Encrypts editor session cookies (32-byte hex)            |
| `PITH_PREVIEW_SECRET` | Enables draft previews via query parameter (32-byte hex) |
| `PITH_SESSION_SECURE` | Set to `true` in production with HTTPS                   |

When using GitHub storage, also set `PITH_GITHUB_OWNER`, `PITH_GITHUB_REPOSITORY`, `PITH_GITHUB_BRANCH`, and `PITH_GITHUB_TOKEN`. See [Storage](./storage.md) for the full set of GitHub variables.

Generate secrets with the CLI (never paste hand-typed values):

```sh
pnpm pith auth hash-password --env
pnpm pith auth generate-secret
```

## Trusted origins

Configure the editor with the exact origin your site runs on. Pith rejects mutations from any other origin:

```ts
// src/lib/pith.ts
import { createPith } from '@pith-cms/next/server';

export const pith = createPith({
  config,
  repository,
  auth: createPasswordAuth({ ... }),
  editor: {
    trustedOrigins: ['https://admin.example.com'],
  },
});
```

Multiple origins are allowed (e.g. staging and production). Wildcards,
protocol-relative origins, and IP addresses are rejected.

## Before deploying

### Secrets

- Use distinct, high-entropy session and preview secrets.
- Keep secrets out of `NEXT_PUBLIC_*`, client props, logs, and source control.
- Configure a precomputed Argon2id password hash or a custom `PithAuthAdapter`. Never configure a plaintext password.

### Network

- Use HTTPS in production and set `PITH_SESSION_SECURE=true`.
- Add every deployed origin to `editor.trustedOrigins`.
- Set a restrictive `frame-ancestors` policy.
- Apply request-size limits at the proxy as well as in Pith. Do not accept multipart uploads for content mutations.
- Keep CSRF and origin checks enabled for login, logout, and every mutation.

### Storage

- Use persistent storage for filesystem writes. Use GitHub storage when writes must work from serverless.
- Scope GitHub credentials to one repository and only the required Contents and Pull requests permissions.

### Editor and preview

- Use a shared preview store when running more than one process.
- Set cache revalidation for content changes made outside the current Pith app.

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

The password adapter's login limit and logout revocation are process-local, as is the memory preview
store. See [Known limitations](./known-limitations.md) for more.

## Next

- [Troubleshooting](./troubleshooting.md) — diagnose common setup issues.
- [Migrations](./migrations.md) — change storage or auth without changing your content files.
- [Errors](./errors.md) — stable error codes and system boundaries.
- [Compatibility](./compatibility.md) — runtimes, frameworks, and deployment environments.
