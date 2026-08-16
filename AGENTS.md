# Repository Guide

## Overview

This is an Nx 23 + pnpm 11 monorepo for `convex-angular`, an Angular library that wraps the Convex client with Signals and dependency injection.

- `packages/convex-angular` — published library with the primary `convex-angular` entry point and the `convex-angular/testing` and `convex-angular/better-auth` secondary entry points.
- `apps/frontend` — standalone Angular demo application and manual integration harness. Its Convex backend lives in `apps/frontend/src/convex`.
- Node is pinned by `.nvmrc`; pnpm is pinned by `packageManager` in `package.json`.

Use pnpm. Prefer existing Nx targets and root scripts over ad hoc commands.

## Common Commands

- `pnpm dev:frontend` — serve the demo app.
- `pnpm dev:backend` — run the Convex development backend. Run it with the frontend for auth and data-flow testing.
- `pnpm build:library` / `pnpm build:frontend` — build the library or demo.
- `pnpm test:library` — run all library Jest tests.
- `nx test convex-angular -- <path-pattern>` — run targeted library tests.
- `nx test convex-angular -- -t "<test name>"` — filter tests by name.
- `pnpm typecheck` — type-check all three library entry points.
- `pnpm typecheck:spec` — type-check specs; Jest transpiles them without type-checking.
- `pnpm lint` — lint all projects. Warnings are tolerated; errors block.
- `pnpm format` / `pnpm format:check` — write or check Prettier formatting.
- `pnpm check:duplication` — run jscpd over library and app sources.
- `pnpm check:deadcode` — run knip; the expected baseline is zero findings.
- `pnpm verify:quick` — source type-check, lint, duplication, and dead-code checks.
- `pnpm verify:full` — source type-check plus lint, test, build, duplication, dead-code, and mutation checks.
- `pnpm test:mutation` — run the Stryker mutation suite directly.

Jest 30 uses `--testPathPatterns` (plural). A bare argument forwarded after `--` also works as a test-path pattern.

## Verification

- Localized change: run the relevant targeted test, then `pnpm verify:quick`.
- Broad, cross-cutting, dependency, configuration, or public-API change: run `pnpm verify:full`.
- Any changed `*.spec.ts`: also run `pnpm typecheck:spec`.
- Markdown-only change: `pnpm format:check` is sufficient.

CI runs `pnpm verify:full` and `pnpm typecheck:spec` for every pull request and push to `main`. Treat both as required.

Git hooks are managed by Lefthook. Pre-commit formats staged files and runs duplication/dead-code checks; pre-push runs lint, test, and build targets. Fix hook failures instead of bypassing them. `LEFTHOOK=0` is acceptable only during a rebase of already-reviewed commits.

Quality baselines are ratchets:

- Keep knip at zero findings. Prefer deleting unused code or exports over adding ignores; every necessary ignore needs a reason.
- Do not raise the jscpd threshold to accommodate new duplication. Extract shared logic instead.
- Prettier may report pre-existing repository drift; format the files you change rather than sweeping unrelated files.

## Architecture and Boundaries

The library exposes standalone `inject*` helpers and `provide*` environment providers; it has no NgModules.

- `src/lib/tokens` — public and internal DI contracts.
- `src/lib/providers` — query, mutation, action, pagination, connection, and auth helpers.
- `src/lib/providers/integrations` — auth-provider adapters.
- `src/lib/guards` and `src/lib/directives` — router guards and structural auth directives.
- `testing/src` — `MockConvexClient` and `provideConvexTesting()`.
- `better-auth/src` — structurally typed Better Auth integration with no direct Better Auth package dependency in the published entry point.

Preserve these patterns:

1. Public `inject*` helpers use `runInResolvedInjectionContext(..., options?.injectRef, ...)`, supporting both ambient injection and an explicit `EnvironmentInjector`.
2. Reactive helpers expose readonly Signals, track reactive argument functions in effects, clean up through `DestroyRef`, and guard stale asynchronous work with generation/version identity.
3. Root-only providers use internal multi-token registration markers plus eager validation for duplicate or nested registration.
4. Public API additions need TSDoc `@public`/`@internal` annotations and the correct entry-point export.

The `convex-angular` TypeScript path alias points to library source, so the demo imports the library through its published package name. Do not replace package-style imports with relative paths into `packages/`.

`provideClerkAuth()`, `provideAuth0Auth()`, and `provideBetterAuth()` already include `provideConvexAuth()`; do not register it again.

## Tests and Tooling

Tests use Jest with `jest-preset-angular`, zone-based TestBed, and colocated `*.spec.ts` files. Jest configs are deliberately CommonJS (`jest.config.cjs`), and Nx infers test targets through `@nx/jest/plugin`; do not add redundant explicit test targets without a concrete need.

Both Jest configs intentionally cap `maxWorkers` at 4 because higher worker counts reproduce a Node 24 `jest-worker` SIGSEGV. Keep the cap unless the Node/runtime issue is re-evaluated with evidence.

Stryker is configured in the root `stryker.config.mjs`. Mutation testing is minutes-slow, so it runs at the end of `verify:full` and in CI, but not in `verify:quick`, Nx targets, or git hooks. It remains report-only because the goal is zero actionable survivors rather than a percentage threshold:

- Strengthen behavior-focused tests before narrowing mutation scope.
- Treat a survivor as equivalent only after constructing a contract-valid behavioral witness or proving none exists.
- For deliberately unkillable code, use the narrowest line-level `// Stryker disable next-line <Mutator>: <reason>` directive. Never use `all` or a broad config exclusion to improve the score, and verify the resulting `Ignored` status in the report.

## Code Conventions

- TypeScript is strict. Avoid `any`, unnecessary assertions, and private-state testing.
- Prettier uses single quotes, a 120-column width, trailing commas, and automatic import sorting.
- Tests should assert public behavior, not duplicate the implementation algorithm or pin incidental scheduling and internal state.
- Prefer semantic error assertions over exact complete error strings unless wording is an intentional public contract.
- Keep generated code generated: `convex dev` owns `apps/frontend/src/convex/_generated`; never edit it manually.
- The demo uses Angular Material 3 and SCSS. Reuse shared layout mixins and Material/application CSS tokens instead of hard-coded colors or one-off utility classes.

## Demo and Releases

Copy `.env.sample` to `.env.local` for local demo development. Environment values are injected by `apps/frontend/plugins/env-var-plugin.js`; never commit secrets.

Releases use Nx release and the version in `packages/convex-angular/package.json`. Pushing a `v*` tag triggers the release workflow, which verifies, builds, checks tag/version consistency, and publishes with provenance.
