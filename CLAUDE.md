# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Nx + pnpm monorepo. The product is `convex-angular`, a published npm library (`packages/convex-angular`) that wraps the Convex client for idiomatic Angular usage via Signals and DI. The `apps/frontend` Angular app is both a demo and the manual test harness for the library, with its own Convex backend under `apps/frontend/src/convex`.

## Commands

Use pnpm. Nx targets can be run either via the package.json scripts or `nx <target> <project>`.

- `pnpm dev:frontend` — serve the demo app (`nx serve frontend`)
- `pnpm dev:backend` — run the Convex dev backend (`convex dev`); both are needed to exercise auth/data flows
- `pnpm build:library` — build the publishable library (`nx build convex-angular`)
- `pnpm build:frontend` — build the demo app
- `pnpm test:library` — run the library unit tests (`nx test convex-angular`)
- `pnpm check:duplication` — copy-paste detection over library + app sources (`jscpd`, config in `.jscpd.json`). Run it after adding or restructuring code; it exits non-zero when duplicated lines exceed the threshold (a ratchet set just above the current baseline). If your change trips it, extract a shared helper instead of raising the threshold; only raise the threshold deliberately, with justification. Spec files are excluded (mock scaffolding is intentionally repeated); the report's clone list tells you exactly which fragments to consolidate.
- `pnpm check:deadcode` — unused files, exports, and dependencies (`knip`, config in `knip.ts`). The baseline is zero findings; keep it that way. Run it after adding/removing files, exports, or dependencies. If it flags your change, delete the dead code or remove the export from `index.ts` rather than suppressing; every entry in `knip.ts`'s ignore lists carries a comment justifying it — follow that pattern if a new exception is genuinely needed (e.g. a dependency used only by a builder at runtime).
- `pnpm update` — `nx migrate latest`

Targeted operations:

- Single library test file: `nx test convex-angular --testFile=inject-query.spec.ts`
- Filter by test name: `nx test convex-angular -t "skipToken"`
- Lint a project: `nx lint convex-angular` (or `nx lint frontend`)
- Run a target across everything: `nx run-many -t build` / `nx run-many -t lint`

Convex `functions` root is configured in `convex.json` as `apps/frontend/src/convex`. `convex dev` regenerates `apps/frontend/src/convex/_generated` (do not edit generated files by hand).

## Architecture

### The library (`packages/convex-angular`)

Everything is exported through `src/index.ts`. The public API is a set of standalone `inject*` functions plus `provide*` environment providers — there are no NgModules. Source prefix is `cva`.

Key layers under `src/lib/`:

- `tokens/` — DI tokens. `CONVEX` holds the `ConvexClient`; `auth.ts` defines `CONVEX_AUTH` and the `ConvexAuthProvider` interface that all auth integrations implement.
- `providers/` — the core `inject*`/`provide*` helpers (`inject-query`, `inject-queries`, `inject-mutation`, `inject-action`, `inject-paginated-query`, `inject-prewarm-query`, `inject-connection-state`, `inject-auth`, `inject-convex`).
- `providers/integrations/` — `clerk.ts` and `auth0.ts`, which adapt those vendors to `ConvexAuthProvider` and re-export `provideConvexAuth()`.
- `guards/auth-guards.ts` — `convexAuthGuard` route guard, configurable via `CONVEX_AUTH_GUARD_CONFIG`.
- `directives/auth-helpers.ts` — structural directives `*cvaAuthenticated`, `*cvaUnauthenticated`, `*cvaAuthLoading`.
- `skip-token.ts` — `skipToken` sentinel for conditionally skipping queries.

Patterns that repeat across the codebase and should be preserved when adding helpers:

1. **Injection-context resolution.** Every public `inject*` helper runs through `runInResolvedInjectionContext(fn, options?.injectRef, ...)` (`providers/injection-context.ts`). This lets helpers be created either ambiently (inside a component/service injection context) or later from plain code by passing an `EnvironmentInjector` as `injectRef`. New helpers must follow this same wrapper so the `injectRef` escape hatch keeps working.

2. **Signal-based reactive results.** Query-like helpers return readonly Signals (`data`, `error`, `isLoading`, `status`, etc.). Reactive arguments are passed as a function (e.g. `argsFn: () => Args | SkipToken`) and tracked inside an `effect`. Subscriptions are re-established when args change and torn down via `DestroyRef.onDestroy`. A monotonic `activeGeneration`/generation counter guards against stale async callbacks landing after a newer subscription started — keep this guard in any new subscription logic.

3. **Provider placement guards.** `provideConvex` and `provideConvexAuth` register internal multi-token "registration markers" plus a guard factory and an `provideEnvironmentInitializer` that eagerly validates. This enforces root-only, single registration and throws clear errors on duplicate/nested use. Mirror this if adding new root-only providers.

### Auth flow

`provideConvexAuth()` wires any `ConvexAuthProvider` into Convex's auth sync. `inject-auth.ts` runs an effect that watches the provider's `isLoading`/`isAuthenticated`/optional `reauthVersion`, and calls `convex.setAuth(fetchToken, onChange)` or `convex.client.clearAuth()` accordingly. `injectAuth().isAuthenticated()` is true only when **both** the provider reports authenticated **and** Convex confirms the token (`backendAuthenticated`). `fetchAccessToken` returning `null` is a normal signed-out outcome, not an error; errors are surfaced through the combined `error()` signal (provider vs internal errors are sequence-ordered).

- `provideConvexAuthFromExisting(Type)` is the default custom path: registers `CONVEX_AUTH` with `useExisting` (not `useClass` — avoids duplicate instances) and includes `provideConvexAuth()`.
- `provideClerkAuth()` / `provideAuth0Auth()` already include `provideConvexAuth()`; never register both.

### The demo app (`apps/frontend`)

Standalone-component Angular app. `app.config.ts` sets up router, PrimeNG (Aura theme, `.dark` dark-mode selector), and animations. Routes live in `app.routes.ts` and `app/routes/*.routes.ts`; demo pages under `app/pages/`. UI uses PrimeNG + Tailwind (`tailwindcss-primeui`).

The demo's auth provider is `app/auth/demo-auth.service.ts`, a `ConvexAuthProvider` backed by `@convex-dev/better-auth`. The Convex backend registers the better-auth component in `src/convex/convex.config.ts`.

**Environment variables**: the build injects `NG_APP_*` vars (see `apps/frontend/plugins/env-var-plugin.js`) into `environment.ts` at build time. Copy `.env.sample` to `.env.local` and set `CONVEX_DEPLOYMENT`, `NG_APP_CONVEX_URL`, `NG_APP_CONVEX_SITE_URL`, `NG_APP_SITE_URL`, `BETTER_AUTH_SECRET`, `SITE_URL`. The auth demo requires `NG_APP_CONVEX_SITE_URL` (the Convex `.site` origin).

## Conventions

- TypeScript path alias: `convex-angular` resolves to `packages/convex-angular/src/index.ts` (tsconfig.base.json) so the app imports the library as if it were the published package.
- Tests are Jest via `jest-preset-angular`; specs live next to source as `*.spec.ts`. Both projects use the shared `jest.preset.js`.
- Prettier: single quotes, `printWidth` 120, trailing commas. Imports are auto-sorted (`@ianvs/prettier-plugin-sort-imports`): builtins → third-party → `@convex-angular/*` → relative. Tailwind classes sorted by the Tailwind plugin.
- Public API surface is documented with TSDoc `@public`/`@internal` tags; keep new exports annotated and re-exported from `index.ts`.
- Releases use Nx release (`nx.json` `release`), versioned from git tags; the library version lives in `packages/convex-angular/package.json`.
