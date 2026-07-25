---
'@pith-cms/cli': patch
---

The `init` command now generates editor files under the `(cms)` route group instead of bare `pith`, adds built-in dark/light theme toggle components, and automatically imports the editor stylesheet. The `auth` command gained `--env`, `--live`, `--session`, and `--preview` flags for targeted secret generation with automatic clipboard copy. The `doctor` command now detects both legacy and new route-group editor paths.
