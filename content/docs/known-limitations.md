---
title: Known limitations
slug: known-limitations
position: 11
description: Current scope boundaries and intentional omissions in this release.
---

# Known limitations

These are intentional scope boundaries for Pith `0.1.x` — not bugs. They may change in future
releases.

- App Router and Node.js runtime only; no Pages Router, Edge Runtime, browser, or CommonJS support.
- The filesystem adapter needs persistent writable storage and one coordinated application instance.
- GitHub publishing is subject to token permissions, provider rate limits, and branch protection.
- Pull-request mode creates one branch and one pull request for each mutation; it does not merge,
  reuse, or clean them up.
- Pith reports repository state, not hosting-provider deployment completion.
- The in-memory preview store is single-instance only; use a shared store (e.g. Redis)
  across replicas. See [Editor and preview](./editor.md#preview-store).
- External content changes can remain in persistent cache until its revalidation period or an explicit
  invalidation.
- There are no persistent drafts, autosave, media uploads, MDX execution, collaboration, scheduling,
  localization, relations, GitLab/Bitbucket adapters, webhooks, or hosted Pith service.

## Next

- [Public API](./public-api.md) — stable and internal API surfaces.
