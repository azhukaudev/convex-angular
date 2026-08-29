# Releasing

Steps for cutting a `convex-angular` release, in order.

## 1. Preconditions

- CI is green on `main`.
- `## Unreleased` in `CHANGELOG.md` has been reviewed and reflects what will ship.

## 2. Bump the version

Bump the version in `packages/convex-angular/package.json` — that manifest is the source of
the published version. At build/publish time, the release workflow reads the version straight
from that manifest and its guard only checks that the pushed tag matches it; nothing derives
the version from the tag itself. (`packages/convex-angular/project.json`'s
`currentVersionResolver: "git-tag"` only applies to `nx release version`, which this workflow
never runs — don't rely on it here.)

## 3. Rename the changelog section

In the **same commit** as the version bump, rename `## Unreleased` to
`## [x.y.z](https://github.com/azhukaudev/convex-angular/compare/vPREV...vx.y.z) (YYYY-MM-DD)`,
then add a fresh, empty `## Unreleased` above it for future work.

Never re-create `## Unreleased` bullets that already shipped in a tagged section — this file
exists because that happened once, and produced a changelog where consumers on a shipped
version could not tell what they already had.

## 4. Land it on `main` before tagging

Commit the version bump and changelog rename, then push it to `main` (or merge its PR) and
wait for CI to go green on that exact commit. Tag that commit specifically — never a local
commit CI hasn't seen and `main` doesn't contain, since that's exactly the divergence between
what's reviewed/tested and what gets published that this runbook exists to prevent.

## 5. Dry run

Trigger the "Release" GitHub Actions workflow via `workflow_dispatch`. It runs the same steps
as a tag push — install, `pnpm verify:ci`, `pnpm typecheck:spec`, `pnpm build:library` — but
skips both the tag-vs-manifest guard (conditional on a tag push) and the publish itself, which
becomes `npm publish --dry-run`. Because the guard is skipped, double-check by eye during a dry
run that the version you intend to tag matches `packages/convex-angular/package.json`.

## 6. Release

Tag the commit from step 4 (not just whatever is currently checked out):

```
git tag vX.Y.Z <sha>
git push origin vX.Y.Z
```

Pushing the tag runs `pnpm verify:ci`, `pnpm typecheck:spec`, `pnpm build:library`, the
tag-vs-manifest guard (`GITHUB_REF_NAME` vs. `dist/packages/convex-angular/package.json`'s
`version`), and finally `npm publish dist/packages/convex-angular --provenance --access public`.
The mutation suite (`pnpm test:mutation`) is not part of this — it already gated the commit in
CI on `main` and does not re-run here.

## 7. Auth

Publishing authenticates with the `NPM_TOKEN` repository secret (referenced by name only —
never write its value anywhere). Migrating to npm trusted publishing, which would remove the
need for this token entirely, is an open option worth revisiting.

## 8. Aftercare

- Confirm the new version is live on npm.
- Confirm `CHANGELOG.md` shows the `## [x.y.z]` heading (not `## Unreleased`) for what shipped.
