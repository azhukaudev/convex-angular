# Repository Guide

## Overview

This is an Nx 23 + pnpm 11 monorepo for `convex-angular`, an Angular library that wraps the Convex client with Signals and dependency injection.

- `packages/convex-angular` — published library with the primary `convex-angular` entry point and the `convex-angular/testing` and `convex-angular/better-auth` secondary entry points.
- `apps/frontend` — standalone Angular demo application and manual integration harness. Its Convex backend lives in `apps/frontend/src/convex`.
- `apps/docs` — Astro Starlight documentation site. It is the one pnpm workspace package (declared in `pnpm-workspace.yaml`) and owns its own `package.json`, so Astro's Vite 8 toolchain resolves independently of the Angular build, which pins Vite 7 exactly.
- Node is pinned by `.nvmrc`; pnpm is pinned by `packageManager` in `package.json`.

Use pnpm. Prefer existing Nx targets and root scripts over ad hoc commands.

## Common Commands

- `pnpm dev:frontend` — serve the demo app.
- `pnpm dev:docs` — serve the documentation site.
- `pnpm build:docs` — build the docs site; it depends on `check:docs`.
- `pnpm check:docs` — run `astro check`, type-check the compiled examples, and verify each one is rendered.
- `pnpm dev:backend` — run the Convex development backend. Run it with the frontend for auth and data-flow testing.
- `pnpm build:library` / `pnpm build:frontend` — build the library or demo.
- `pnpm test:library` — run all library Jest tests.
- `nx test convex-angular -- <path-pattern>` — run targeted library tests.
- `nx test convex-angular -- -t "<test name>"` — filter tests by name.
- `pnpm typecheck` — type-check all three library entry points.
- `pnpm typecheck:spec` — type-check specs; Jest transpiles them without type-checking.
- `pnpm lint` — lint all projects. The workspace is at zero errors and zero warnings; keep it there.
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
- Plain Markdown-only change: `pnpm format:check` is sufficient.
- Any change under `apps/docs` — including `.mdx`, which is executable content, not prose: run `pnpm check:docs` (or `pnpm build:docs`). `format:check` alone is not sufficient there.

CI runs `pnpm verify:full` and `pnpm typecheck:spec` for every pull request and push to `main`. Treat both as required.

Git hooks are managed by Lefthook. Pre-commit formats staged files and runs duplication/dead-code checks; pre-push runs lint, test, and build targets. Fix hook failures instead of bypassing them. `LEFTHOOK=0` is acceptable only during a rebase of already-reviewed commits.

Quality baselines are ratchets:

- Keep ESLint at zero warnings as well as zero errors. Fix the cause rather than silencing it: narrow the type instead of asserting with `!`, delete the unused binding, and reach for an inline `eslint-disable` only with a reason comment. Generated or build output that cannot be edited belongs in the relevant `eslint.config.mjs` `ignores`, not in a suppression comment.
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

Specs stand the Convex client up through `MockConvexClient` and `provideConvexTesting()` from `convex-angular/testing`, not a hand-rolled `jest.Mocked<ConvexClient>` literal. The library dogfooding its own published test double is deliberate: a capability the mock cannot express is a gap consumers hit too, so extend the mock rather than fake around it. Two deliberate exceptions remain — `tokens/convex.spec.ts` needs a real `ConvexClient`, and one `injectPaginatedQuery` test injects a client that genuinely lacks `onPaginatedUpdate_experimental`.

The mock mirrors the installed client's semantics, so verify against `node_modules/convex` before changing it. In particular `hasAuth()` reports a held token (seed one with `seedAuth`), not a `setAuth` registration; `clearAuth()` does not stop registered callbacks; and `emitAfterUnsubscribe()` reaches a defensive staleness guard that the real client can never trigger, so it is not for ordinary tests. For error paths the mock cannot express, `jest.spyOn(convex.client, ...)` on the mock's own stable `client` object is the supported escape hatch.

Stryker is configured in the root `stryker.config.mjs`. Mutation testing is minutes-slow, so it runs at the end of `verify:full` and in CI, but not in `verify:quick`, Nx targets, or git hooks. It remains report-only because the goal is zero actionable survivors rather than a percentage threshold:

- Strengthen behavior-focused tests before narrowing mutation scope.
- Treat a survivor as equivalent only after constructing a contract-valid behavioral witness or proving none exists.
- For deliberately unkillable code, use the narrowest line-level `// Stryker disable next-line <Mutator>: <reason>` directive. Never use `all` or a broad config exclusion to improve the score, and verify the resulting `Ignored` status in the report.

## Documentation Site

`apps/docs` is an Astro Starlight site. Content lives in `apps/docs/src/content/docs/**` as Markdown/MDX; the sidebar is configured in `apps/docs/astro.config.mjs`.

Code samples resist drift by being real files. Anything substantial lives in `apps/docs/src/examples/**.ts`, is type-checked by `apps/docs/tsconfig.examples.json` against the library **source** through the `convex-angular` path aliases, and is rendered on the page with Starlight's `<Code>` component and a Vite `?raw` import. A renamed helper or a removed export therefore fails `nx run docs:check` instead of silently rotting. `astro build` does not type-check, which is why `check` is a separate target that `build` depends on.

- `apps/docs/src/examples/convex/api.ts` is a hand-written stand-in for the `api` object `convex dev` generates. Extend it rather than importing a real generated file.
- Examples import package names (`convex-angular`), never relative paths into `packages/`.
- Starlight itself validates only the slugs named in the `sidebar` config, so `starlight-links-validator` is registered to cover cross-links inside page content. Both fail the build.
- `apps/docs/scripts/check-examples-referenced.mjs` fails the `check` target when an example is not rendered by any page, since the knip entry glob cannot distinguish an orphan from a rendered file.
- Astro's optional `sharp` dependency is denied in `pnpm-workspace.yaml`; the site uses Astro's passthrough image service instead. Do not add image optimization without revisiting that decision.

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
