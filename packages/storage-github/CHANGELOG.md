# @pith-cms/storage-github

## 0.1.3

### Patch Changes

- @pith-cms/core@0.1.3

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

- Updated dependencies [cbceb64]
  - @pith-cms/core@0.1.1

## 0.1.0

### Minor Changes

- Add GitHub Contents API storage with direct and pull-request publishing, safe publication metadata,
  and editor publication feedback.
- Add authenticated preview sessions, persistent canonical cache tags and invalidation, repository-ref
  preview capability, GitHub review-state resolution, and structured editor conflict comparison.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @pith-cms/core@0.1.0
