---
title: Compatibility and runtime policy
slug: compatibility
position: 10
description: What runtimes, frameworks, and deployment environments Pith targets.
---

# Compatibility and runtime policy

Pith `0.1.x` is ESM-only and supports Next.js App Router applications running on Node.js. The Pages
Router, Edge Runtime, browsers, React Native, workers, and CommonJS consumers are unsupported.

## Tested release baseline

| Component         | Supported baseline  |
| ----------------- | ------------------- |
| Node.js           | `>=24.7.0`          |
| pnpm              | `>=11`              |
| TypeScript        | `>=5.9`             |
| Next.js           | `16.2.x` App Router |
| React / React DOM | `19.2.x`            |

The exact peer ranges in `@pith-cms/next` are `next@^16.2.10`, `react@^19.2.7`, and
`react-dom@^19.2.7`. Pith does not bundle those packages.

Node.js 24.7 is the minimum because the password-auth reference implementation uses Node's native
Argon2id.

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

## Next

- [Known limitations](./known-limitations.md) — current scope boundaries and intentional omissions.
- [Public API](./public-api.md) — stable and internal API surfaces.
