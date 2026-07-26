# @pith-cms/storage-filesystem

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

- cbceb64: Added `filesystemStorageVersion` export for version tracking.
- Updated dependencies [cbceb64]
  - @pith-cms/core@0.1.1

## 0.1.0

### Minor Changes

- Add protected Next.js editor routes, adapter-based authentication, Argon2id password sessions,
  CSRF/origin-protected mutations, schema-generated forms, revision conflicts, and create-only
  filesystem writes. The password-hash bootstrap command now prints the escaped assignment required
  for Next.js `.env` files.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @pith-cms/core@0.1.0
