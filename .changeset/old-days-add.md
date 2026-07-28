---
'@pith-cms/core': minor
'@pith-cms/next': minor
'@pith-cms/cli': minor
'@pith-cms/storage-filesystem': minor
'@pith-cms/storage-github': minor
---

Editor UX: added Docs link in sidebar footer, save confirmation dialog, redesigned
preview flow (Exit in banner, Update Preview in actions with accent highlight),
narrower theme warning banner with docs link, save button disabled when content
unchanged. Content ordering by collection `order` field. Mobile breakpoint moved to
860px with fixed bottom toolbar and overlay dialogs. Docs headings now auto-generate
IDs for hash-anchor navigation.

Middleware → proxy: renamed `middleware.ts` to `proxy.ts` across apps, CLI `init`
command, and documentation.

Core: added `order` field validation in collection schema.

---
