# Compatibility and runtime policy

Pith `0.1.x` is ESM-only and supports Next.js App Router applications running on Node.js. The Pages
Router, Edge Runtime, browsers, React Native, workers, and CommonJS consumers are unsupported.

## Tested release baseline

| Component         | Supported baseline  | Release test                                  |
| ----------------- | ------------------- | --------------------------------------------- |
| Node.js           | `>=24.7.0`          | Node 24 in CI; required for built-in Argon2id |
| pnpm              | `>=11`              | CI and package fixture                        |
| TypeScript        | `>=5.9`             | workspace type checks and packed fixture      |
| Next.js           | `16.2.x` App Router | production playground and package fixture     |
| React / React DOM | `19.2.x`            | Next peer dependency and package fixture      |

The exact peer ranges in `@pith-cms/next` are `next@^16.2.10`, `react@^19.2.7`, and
`react-dom@^19.2.7`. Pith does not bundle those packages.

Node.js 24.7 is the minimum because the password-auth reference implementation uses Node's native
Argon2id implementation. Projects that use a custom auth adapter should still use the documented
minimum until a separate compatibility policy says otherwise.

## Package runtime matrix

| Package                        | Runtime                    | Notes                                                 |
| ------------------------------ | -------------------------- | ----------------------------------------------------- |
| `@pith-cms/core`               | General JavaScript runtime | No Next, React, filesystem, or GitHub dependency.     |
| `@pith-cms/next`               | Next.js Node.js runtime    | Server entry points are protected with `server-only`. |
| `@pith-cms/cli`                | Node.js                    | Installed as a dev dependency; requires `>=24.7.0`.   |
| `@pith-cms/storage-filesystem` | Node.js                    | Requires a persistent filesystem for writes.          |
| `@pith-cms/storage-github`     | Server-side Node.js        | Uses GitHub APIs; no local Git clone or subprocess.   |

## Deployment matrix

| Storage mode        | Suitable deployment                                            | Not suitable for persistent writes                                    |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Filesystem          | Local development, VPS, single-host Node.js, Docker volume     | Edge, read-only deploys, ephemeral serverless, uncoordinated replicas |
| GitHub direct       | Node.js server or serverless runtime with a GitHub credential  | Protected branches that reject direct writes                          |
| GitHub pull request | Node.js server or serverless runtime with GitHub PR permission | Workflows expecting one long-lived draft PR                           |

Use persistent cache mode only for canonical reads. Preview reads bypass it. External content changes
are observed through time revalidation, explicit invalidation, redeployment, or a future webhook.
