# Release policy and rollback

## Versioning

Pith starts at `0.1.0`. While major version is zero, breaking stable API changes require a minor
release, additive changes require a minor release, and fixes require a patch release. Experimental
APIs, if introduced, use explicit experimental subpaths and may change more quickly.

Every user-facing pull request adds a Changeset. The release workflow creates or updates a version
pull request with package versions and changelogs. Once that pull request is reviewed and merged, the
protected workflow verifies the repository, packs artifacts, publishes only the five public packages,
creates a GitHub release, and uses npm trusted publishing/provenance.

## Prereleases

Use a prerelease channel before a stable release:

```sh
pnpm changeset pre enter next
pnpm version:packages
pnpm release --tag next
```

Do not overwrite a stable tag with a prerelease. Complete a clean external installation using the
published prerelease before promoting a stable initial release.

## Publication prerequisites

- Confirm the final npm scope and that the publishing account owns it.
- Set final repository, homepage, and issue URLs in every public manifest.
- Configure npm trusted publishing for the protected GitHub workflow and package scope.
- Keep the release working tree clean and committed.
- Run `pnpm check:release`, `pnpm pack:check`, and the full CI workflow.
- Review generated changelogs, tarballs, package sizes, and release notes.

## Rollback

Never overwrite an existing npm version. For a defective release, stop promotion, deprecate the
affected version where appropriate, publish a corrected patch, update release notes, and pin docs or
examples to a known-good version if needed. Preserve the original Git tag and build evidence.
