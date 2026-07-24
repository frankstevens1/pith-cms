# Changesets

Add a changeset for every user-facing package change:

```sh
pnpm changeset
```

Use `pnpm version:packages` to apply pending changesets. Publishing remains a manually dispatched CI action until releases are enabled.
