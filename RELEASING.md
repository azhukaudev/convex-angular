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
what's reviewed/tested and what gets published that this runbook exists to prevent. The release
workflow enforces this: a tag whose commit is not contained in `main` fails at the "Check tagged
commit is on main" step, before anything is installed, built, or published.

## 5. Dry run

Trigger the "Release" GitHub Actions workflow via `workflow_dispatch`. It runs the same steps
as a tag push — install, `pnpm verify:ci` (which includes `pnpm typecheck:spec`), `pnpm build:library` — but
skips the on-`main` check and the tag-vs-manifest guard (both conditional on a tag push) and the
publish itself, which becomes `npm publish --dry-run`. Because the guards are skipped, double-check
by eye during a dry run that the commit is on `main` and that the version you intend to tag
matches `packages/convex-angular/package.json`. The publish job runs in the `Production`
environment (see Auth), so once required reviewers are configured the dry run also waits for one
approval.

## 6. Release

Tag the commit from step 4 (not just whatever is currently checked out):

```
git tag vX.Y.Z <sha>
git push origin vX.Y.Z
```

Pushing the tag runs the on-`main` check (the tagged commit must be an ancestor of
`origin/main`), `pnpm verify:ci` (which includes `pnpm typecheck:spec`), `pnpm build:library`, the
tag-vs-manifest guard (`GITHUB_REF_NAME` vs. `dist/packages/convex-angular/package.json`'s
`version`), and finally `npm publish dist/packages/convex-angular --provenance --access public`.
The mutation suite (`pnpm test:mutation`) does not run in the release workflow. It is
report-only in CI (`stryker.config.mjs` sets no break threshold), so if you want that signal,
review the latest `mutation-report` artifact on `main` before tagging.

## 7. Auth

The publish job runs in the `Production` GitHub environment. Publishing authenticates with the
`NPM_TOKEN` secret (referenced by name only — never write its value anywhere), which should live
as a `Production` environment secret rather than a repository secret; an environment secret with
the same name takes precedence for jobs in that environment. Migrating to npm trusted publishing,
which would remove the need for this token entirely, is an open option worth revisiting. It can
be bound to the `Production` environment.

## 8. Aftercare

- Confirm the new version is live on npm.
- Confirm `CHANGELOG.md` shows the `## [x.y.z]` heading (not `## Unreleased`) for what shipped.

## 9. Repository protections (one-time, admin)

These live in GitHub repository settings, not in the workflow, and only an admin can change
them. The workflow changes above assume they are in place:

- Merge the branch that added the on-`main` check and the `environment: Production` line to
  `main` first, so the environment is referenced by the workflow before the secret moves.
- **Production environment**: add a required reviewer (Settings, Environments, `Production`).
  Optionally restrict "Deployment branches and tags" to tags matching `v*`.
- **`NPM_TOKEN`**: add it as a `Production` environment secret (with a new token value), then
  delete the repository-level secret and revoke the old npm token, since it was available to
  every workflow until now. Alternatively, configure npm trusted publishing for `convex-angular`
  bound to this repository, the `release.yml` workflow, and the `Production` environment, then
  delete the token entirely; that also needs a workflow edit to drop `NODE_AUTH_TOKEN`.
- **Protect `main`**: a branch ruleset on `main` that requires a pull request and the
  `CI / verify` status check (job `verify` in `ci.yml`), and blocks force-pushes and deletion.
- **Restrict release tags**: a tag ruleset targeting `v*` that limits creation, update, and
  deletion to admins.
- **Rehearse**: run the "Release" workflow via `workflow_dispatch` once. Expect it to wait for
  environment approval, then pass, with the on-`main` check skipped (it only runs on tag pushes).
