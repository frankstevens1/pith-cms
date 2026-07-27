# @pith-cms/next

## 0.2.0

### Minor Changes

- 2399bda: Generated ThemeToggle reads theme synchronously, eliminating navigation flicker.

## 0.1.2

### Patch Changes

- 71ef629: fix: dynamic versions, editor route group scaffolding, layout fixes, and theme banner improvements

  - All packages now derive their version from package.json instead of hardcoded
    strings, keeping editor sidebar, CLI banner, and user-agent in sync.
  - `pith init` now scaffolds the editor inside a `(cms)` route group with built-in
    theme components and automatic editor.css import, plus a note about moving
    shared UI into an `(app)` route group.
  - The delete confirmation dialog now appears in the sidebar footer instead of
    below the form body, remaining visible regardless of form length.
  - The MissingThemeScriptBanner no longer flashes on refresh, and the code
    snippet has syntax-colored tokens with a copy-to-clipboard button.
  - Login form button uses suppressHydrationWarning to avoid a React hydration
    mismatch warning.
  - Saving a new entry no longer triggers a beforeunload confirm dialog.
  - Config comment changed from "do not edit" to a neutral description.

- Updated dependencies [71ef629]
  - @pith-cms/core@0.1.2

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
