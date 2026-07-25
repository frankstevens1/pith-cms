# @pith-cms/next

## 0.1.1

### Patch Changes

- 0256902: Preview sessions now close automatically when an entry is saved or exited, and the default memory preview store is shared process-wide so previews work reliably in Next.js development mode.
- 0256902: The editor sidebar Preview button now becomes "Exit preview" while a preview session is active. The preview banner no longer shows an Exit control; instead it polls the server every 3 seconds and refreshes on focus so the banner disappears automatically when the preview is disabled from another tab. View controls remain aligned to the same height. The consumer playground preview banner closes the preview tab and returns focus to the editor tab.
- Updated dependencies [cbceb64]
  - @pith-cms/core@0.1.1

## 0.1.0

### Minor Changes

- Add GitHub Contents API storage with direct and pull-request publishing, safe publication metadata,
  and editor publication feedback.
- Add protected Next.js editor routes, adapter-based authentication, Argon2id password sessions,
  CSRF/origin-protected mutations, schema-generated forms, revision conflicts, and create-only
  filesystem writes. The password-hash bootstrap command now prints the escaped assignment required
  for Next.js `.env` files.
- Add server-only, typed Next.js content reads with explicit missing-entry handling, request-scoped
  caching, cache-tag helpers, and App Router integration support.
- Add authenticated preview sessions, persistent canonical cache tags and invalidation, repository-ref
  preview capability, GitHub review-state resolution, and structured editor conflict comparison.
- Editor UX: named sign-in heading, page-level headings on collection and entry screens, and a live
  On/Off state readout for boolean fields.

### Patch Changes

- Updated dependencies
  - @pith-cms/core@0.1.0
