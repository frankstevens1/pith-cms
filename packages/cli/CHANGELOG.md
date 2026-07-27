# @pith-cms/cli

## 0.1.3

### Patch Changes

- 2399bda: Generated ThemeToggle reads theme synchronously, eliminating navigation flicker.
- Updated dependencies [2399bda]
  - @pith-cms/next@0.2.0

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
  - @pith-cms/next@0.1.2

## 0.1.1

### Patch Changes

- cbceb64: The `init` command now generates editor files under the `(cms)` route group instead of bare `pith`, adds built-in dark/light theme toggle components, and automatically imports the editor stylesheet. The `auth` command gained `--env`, `--live`, `--session`, and `--preview` flags for targeted secret generation with automatic clipboard copy. The `doctor` command now detects both legacy and new route-group editor paths.
- Updated dependencies [cbceb64]
- Updated dependencies [0256902]
- Updated dependencies [0256902]
  - @pith-cms/core@0.1.1
  - @pith-cms/next@0.1.1
