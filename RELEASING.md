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

Trigger the "Release" GitHub Actions workflow via `workflow_dispatch`. It runs only the `verify`
job: install, `pnpm verify:ci` (which includes `pnpm typecheck:spec`), `pnpm build:library`, and
`npm publish dist/packages/convex-angular --dry-run`. It skips the on-`main` check and the
tag-vs-manifest guard (both are tag-push-only), so double-check by eye that the commit is on
`main` and that the version you intend to tag matches `packages/convex-angular/package.json`.
The dry run never starts the `publish` job: no `Production` environment, no approval, no
`NPM_TOKEN`, no OIDC token. It can be dispatched from any ref, but rehearse the commit you intend
to tag.

## 6. Release

Tag the commit from step 4 (not just whatever is currently checked out):

```
git tag vX.Y.Z <sha>
git push origin vX.Y.Z
```

Pushing the tag runs two jobs. `verify` runs the on-`main` check (the tagged commit must be an
ancestor of `origin/main`), install, `pnpm verify:ci` (which includes `pnpm typecheck:spec`),
`pnpm build:library`, and the tag-vs-manifest guard (`GITHUB_REF_NAME` vs.
`dist/packages/convex-angular/package.json`'s `version`), then uploads
`dist/packages/convex-angular` as the `convex-angular-dist` artifact. `publish` needs `verify`,
waits for the `Production` environment's approval once one is configured, downloads that artifact,
and runs `npm publish dist/packages/convex-angular --provenance --access public --ignore-scripts`.
`publish` installs nothing from the workspace. The mutation suite (`pnpm test:mutation`) does not run in the release workflow. It is
report-only in CI (`stryker.config.mjs` sets no break threshold) and runs on pull requests only,
so if you want that signal, review the `mutation-report` artifact of the pull requests going into
the release, or run `pnpm test:mutation` locally before tagging.

## 7. Auth

The `publish` job (not the whole workflow) runs in the `Production` GitHub environment. It is the
only job with `id-token: write` and the only place `NPM_TOKEN` is referenced. Publishing
authenticates with the `NPM_TOKEN` secret (referenced by name only — never write its value
anywhere), which should live as a `Production` environment secret rather than a repository
secret; an environment secret with the same name takes precedence for jobs in that environment.
Migrating to npm trusted publishing, which would remove the need for this token entirely, is an
open option worth revisiting. The `publish` job already has its job-scoped `id-token: write`, so
adopting it means dropping `NODE_AUTH_TOKEN` from the `Publish` step; configure the trusted
publisher for workflow `release.yml` and environment `Production`.

## 8. Aftercare

- Confirm the new version is live on npm.
- Confirm `CHANGELOG.md` shows the `## [x.y.z]` heading (not `## Unreleased`) for what shipped.

## 9. Repository protections (one-time, admin)

The checks inside `release.yml` guard against mistakes; they are **not** a security boundary,
because anyone who can push a tag or branch can edit the workflow file in that ref. The boundary
is these repository settings, which only an admin can change and which this repo does not have
yet (as of 2026-11-02: no required reviewer on `Production`, no rulesets). The workflow assumes
they are in place:

- Merge the branch that added the on-`main` check and the `environment: Production` line to
  `main` first, so the environment is referenced by the workflow before the secret moves.
- **Production environment**: add a required reviewer (Settings, Environments, `Production`).
  Also restrict "Deployment branches and tags" to tags matching `v*` (recommended). This is safe
  because `workflow_dispatch` runs never enter `Production`, so the restriction cannot break the
  rehearsal.
- **`NPM_TOKEN`**: add it as a `Production` environment secret (with a new token value), then
  delete the repository-level secret and revoke the old npm token, since it was available to
  every workflow until now. Alternatively, configure npm trusted publishing for `convex-angular`
  bound to this repository, the `release.yml` workflow, and the `Production` environment, then
  delete the token entirely; that also needs a workflow edit to drop `NODE_AUTH_TOKEN`.
- **Protect `main`**: a branch ruleset on `main` that requires a pull request and the
  `CI / verify` status check (job `verify` in `ci.yml`), and blocks force-pushes and deletion.
  The release workflow also has a job named `verify`; its check appears as `Release / verify`, so
  require `CI / verify` by its full name.
- **Restrict release tags**: a tag ruleset targeting `v*` that limits creation, update, and
  deletion to admins.
- **Rehearse**: run the "Release" workflow via `workflow_dispatch` once. Expect it to pass without
  waiting for approval (the dispatch path never starts `publish`), with the on-`main` check
  skipped (it only runs on tag pushes). The environment approval and the OIDC/provenance path are
  first exercised by the next real tag push, so watch that run: `publish` should wait for
  approval, then publish with provenance.
