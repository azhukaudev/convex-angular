# convex-angular

## Unreleased

### ✨ Features

- Add an auth surface to `convex-angular/testing`'s `MockConvexClient`, so components using `injectAuth()` can be tested against it: `client.setAuth()` records a `MockAuthRegistration` (`authRegistrations`, `lastAuthRegistration()`) whose `fetchToken()`, `setAuthenticated()` and `setRefreshing()` play the client's side of the handshake, `seedAuth()` gives the client the token that `getAuth()` reports and that makes `client.hasAuth()` true, and `clearAuthCount`/`hasAuthCount` record the calls. The surface was previously an inert no-op with `hasAuth()` hard-coded to `false`.
- Add `MockConvexClient.query()` for one-shot reads, following the real client: a warm-cache hit seeded by `seedQueryResult()` resolves immediately, and a miss opens a subscription that stays pending until the test settles it.
- Add capture surfaces to `MockConvexClient` for assertions that previously needed a hand-rolled spy — `MockCallableCall.options` (the `{ optimisticUpdate }` object `injectMutation()` forwards), `localQueryResultCalls`, per-subscription `unsubscribeCount`, and `connectionStateReads`/`connectionStateSubscriptions`/`connectionStateUnsubscribes` — plus `refusedSubscriptions`, which records the subscriptions a disabled client skips so their absence is provable. The `client` getter now returns a stable object, so `jest.spyOn(convex.client, ...)` works for error paths the mock cannot arm itself.
- Add `emitAfterUnsubscribe()`/`emitErrorAfterUnsubscribe()` to both `MockConvexClient` subscription records, for tests that target a helper's defensive staleness guard. The real client removes its listener synchronously on unsubscribe and can never deliver there, so these assert against behaviour a deployment does not produce.
- Add `MockConvexClient.seedQueryError()` to seed the warm cache with a failed result: `client.localQueryResult()` throws it, and `query()` rejects with it, matching the real client's behavior for a warmed query that failed on the server.
- Add `MockConvexAuthProvider` and `provideConvexAuthTesting()` to `convex-angular/testing`: a driveable `ConvexAuthProvider` double (`setLoading()`, `signIn()`/`signOut()`, `setError()`, `bumpReauth()`, `failNextFetch()`) plus one-call registration under `CONVEX_AUTH` alongside `provideConvexAuth()`, so `injectAuth()`, the auth directives, and the route guards no longer need a hand-rolled `ConvexAuthProvider` literal in every test. The double is deliberately inert — it never flips its own state, so `MockAuthRegistration` still drives Convex's side of the handshake.

### ⚠️ Breaking Changes

- Raise the `@angular/common`, `@angular/core`, and `@angular/router` peer dependency floors again, from `>=21.2.17` to `>=21.2.25`, which patches two high-severity advisories in earlier releases — an i18n XSS in `@angular/core`/`@angular/compiler`, and an `HttpTransferCache` cache-key ambiguity that could enable cross-request response reuse, the latter landing directly on this library's SSR/TransferState feature — and three high-severity `@angular/router` denial-of-service advisories in server-side rendering (GHSA-62vg-58rm-qff7, GHSA-57xq-rjx2-v5xh, GHSA-ff3f-86qr-9cv3). One of the router advisories makes the router re-run `canMatch` guards and route resolvers per crafted URL segment, which amplifies `convexAuthGuard` and `convexQueryResolver` work on the server. Consumers on an older Angular must upgrade to install.
- `convex-angular/testing`: `MockConvexClient.subscribeToConnectionState()` no longer registers the listener when the client is `disabled`, matching the real client, which returns a no-op without subscribing. Tests that pushed connection state into a disabled mock will now observe no delivery.
- `convex-angular/testing`: a disabled `MockConvexClient` (`{ disabled: true }`) now rejects `mutation()`/`action()` with `ConvexClient is disabled`, matching the real SSR client instead of silently capturing the call. This is a test-fidelity fix; tests that invoked mutations/actions against a disabled mock must now assert the rejection.
- Cap the previously unbounded `convex` and Angular peer dependency ranges: `convex` to `>=1.42.1 <2.0.0`, and `@angular/common`/`@angular/core`/`@angular/router` to `>=21.2.25 <22.0.0`. Nothing here was ever compiled or tested against `convex@2.x` or `@angular/core@22`, so the old ranges let both satisfy the manifest untested. The planned Angular 22 migration ships as convex-angular `2.0.0`, which will raise the Angular cap deliberately at that point. Consumers pinned outside these ranges must adjust.

### 🐛 Bug Fixes

- `injectQuery()`/`injectQueries()`: a query whose warm-cache entry is an error (the deployment already rejected this exact query + args) no longer throws from inside the subscription effect and wedges the query in `pending` forever. The helper now subscribes normally, and the client's own replay of the cached result surfaces it through `error()`; recovery stays automatic on a later server transition. `injectQueries()` also no longer aborts reconciliation of later keys when an earlier key hits this case.
- `injectPaginatedQuery()` no longer duplicates items across pages when the server splits a non-first page: the upstream fix (get-convex/convex-js#54981, `7ceee3e`) makes the first split page resume from the split page's own cursor instead of restarting from `null`. `injectPaginatedQuery()` delegates to `ConvexClient.onPaginatedUpdate_experimental`, so no convex-angular code changed — upgrade the `convex` peer dependency to `>=1.43.0` to pick it up (the declared peer floor stays at `>=1.42.1`).
- `injectQueries()`: a key removed from the definition while it was using `skipToken` no longer leaves a stale `'skipped'` entry in `results`, `errors`, and `statuses`. `isLoading()` was unaffected, but consumers iterating `Object.keys(results())` saw a key that no longer existed.
- `convex-angular/better-auth`: a superseded token exchange no longer writes shared error state — a stale failure could surface through `injectAuth().error()` even though the current request had already succeeded, and a stale success could clear an error the current request had just recorded. 1.10.0 scoped the token cache this way; the error state now matches.
- `injectMutation().mutate()`/`injectAction().run()` called from inside an Angular `effect()` no longer registers the internal version counter as a dependency of that effect and re-triggers it; the version reads are now `untracked()`.
- `injectPaginatedQuery()`'s `loadMore()` called after the owning scope is destroyed now returns `false`, matching the documented contract, instead of throwing from the retained client closure.
- Auth guards (`convexAuthGuard`, `convexUnauthGuard`, `createConvexAuthGuard()`) and `convexQueryResolver()` no longer leave a registration on the route's environment injector after every navigation. The guards leaked one live effect per check — re-run on every later auth-status change — and the resolver one destroy hook that kept the resolved value reachable, so memory and per-auth-transition work grew with navigation count in long-lived apps.
- A throwing `onSuccess`/`onError` callback no longer corrupts the operation it observes. On `injectMutation()`/`injectAction()`, an `onSuccess` throw used to mark a committed mutation as failed — `error()` set, `onError` fired, `mutate()`/`run()` rejected — and an `onError` throw replaced the rejection value; on `injectQuery()`/`injectQueries()`/`injectPaginatedQuery()` it aborted the Convex client's dispatch for every later subscriber of that update. Callback errors are now reported to Angular's `ErrorHandler` instead. Code that relied on `mutate()` rejecting when `onSuccess` throws must handle that error in the callback.
- `provideConvex()` now forwards `skipConvexDeploymentUrlCheck` and `logger` to the `ConvexHttpClient` it creates for server-side rendering. Previously only the browser `ConvexClient` received them, so a deployment URL that needs `skipConvexDeploymentUrlCheck: true` worked in the browser but failed the server render, and a custom or disabled `logger` was ignored for server-side query logs.
- `injectAuth()`: signals an auth provider's `fetchAccessToken()` reads before its first `await` no longer become dependencies of the internal auth sync effect. The Convex client fetches the first token synchronously inside `setAuth`, so a change to such a signal (for example Clerk's `sessionAudience`) re-ran the whole auth setup, and a provider whose fetcher wrote a signal it also read could loop.

### 🏡 Chore

- Swap the library test toolchain from Vitest to Jest (`jest-preset-angular`).
- Add Stryker mutation testing over the published entry points (`pnpm test:mutation`).
- Migrate the library's own specs onto `MockConvexClient` and `provideConvexTesting()`; they previously hand-rolled a `jest.Mocked<ConvexClient>` literal per file, so nothing exercised the double shipped to consumers.
- Lint the workspace to zero warnings as well as zero errors, and record that as a ratchet alongside knip and jscpd.
- Bump the workspace's Angular framework packages to `21.2.25` and build-toolchain packages to `21.2.28` (the `21.2.x` tips; `@angular/cdk`/`@angular/material` intentionally stay at `21.2.14`, their own 21.x tip), `better-auth` to `1.6.22` (a HIGH pre-account-hijacking advisory fix), `@convex-dev/better-auth` to `0.12.5`, and `ng-packagr` to `21.2.7`.
- Bump the workspace's `convex` pin to `1.45.0` and add a new internal adapter (`src/lib/internal/convex-client-internals.ts`) that gathers the library's nine `BaseConvexClient`/experimental-API access sites behind one seam, plus a contract spec that asserts each of them against a real `ConvexClient` — consumer-invisible, but it turns a convex bump that moves this surface into a caught regression instead of a silent one. `convex-angular/testing`'s `MockConvexClient` now satisfies a compile-time conformance type instead of bridging to `ConvexClient` through an unchecked `as unknown as` cast.
- Read query/action argument types through `FunctionArgs<Ref>` instead of the `Ref['_args']` slot in `injectQuery()`, `injectQueries()`, `injectAction()`, `injectPrewarmQuery()`, and `queryResolver()`. convex 1.46.0 deprecated `FunctionReference._args`/`_returnType` (get-convex/convex-js#56778) ahead of removing them; `FunctionArgs` has been an identical alias since before the `>=1.42.1` peer floor, so this is a type-level no-op for consumers and a compile-time regression avoided when the slot goes away.
- Strengthen the real-client contract spec: it now asserts that `onRefreshChange` is forwarded, that `hasAuth()` follows `setAuth`/`clearAuth`, the shape of the paginated payload, the client-injected `paginationOpts.id` (a number), and the real client's replay of a cached query error to a fresh listener, instead of only checking that each member exists. CI also runs the library tests against the `convex` peer floor (1.42.1) and the latest release.
- `convex-angular/testing`: `MockConvexClient`'s low-level client surface is now type-checked against the real `BaseConvexClient`, so a drifted internal signature fails to compile. `AuthTokenFetcher` is now an alias of the identical type exported by `convex/browser`. No consumer-visible change.

## [1.10.0](https://github.com/azhukaudev/convex-angular/compare/v1.9.0...v1.10.0) (2026-07-11)

### ✨ Features

- Add a `convex-angular/better-auth` entry point with `provideBetterAuth()` and `injectBetterAuth()`: built-in Better Auth integration (session tracking, Convex token exchange with caching/refresh/dedup) with no dependency on better-auth packages — the client is consumer-provided and typed structurally.
- Add an optional `ClerkAuthProvider.sessionAudience` signal: when the session token's `aud` claim is `'convex'`, `provideClerkAuth()` uses Clerk's native Convex integration instead of requesting the `'convex'` JWT template.
- Add `ssr.transferAuthenticatedResults` (default `true`) to `provideConvex(...)`: set to `false` to keep authenticated SSR query results out of `TransferState`/the rendered HTML, trading a brief post-hydration loading state for avoiding shared-cache exposure of per-user data.

### ⚠️ Breaking Changes

- Raise the `@angular/common`, `@angular/core`, and `@angular/router` peer dependency floors from `>=21.0.0` to `>=21.2.17`, which patches three high-severity advisories (hydration DOM clobbering/cache poisoning, `HttpTransferCache` weak key hashing, `formatDate` DoS) and one moderate advisory (two-way binding sanitization bypass); consumers on an older Angular must upgrade to install.
- `provideClerkAuth()` and `provideAuth0Auth()`: a vendor token-fetch failure (e.g. an expired Auth0 SSO session throwing `login_required`) now resolves `null` — the normal signed-out outcome — instead of rejecting and surfacing through `injectAuth().error()`, matching convex-react's Clerk/Auth0 adapters.
- `Auth0AuthProvider.getAccessTokenSilently` return type is now `Promise<string | null>`; the documented implementation requests `detailedResponse: true` and returns the OIDC `id_token` (the token Convex validates) instead of the access token.
- `convex-angular/testing`: `MockConvexClient` subscriptions no longer deliver `emit`/`emitError` after unsubscribe, matching the real client. This is a test-fidelity fix, but tests that emitted to a torn-down subscription will now observe no delivery.
- `convex-angular/better-auth`: on a 401/403 session response, `refreshSession()` no longer falls back to the cross-domain plugin's cached `getSessionData()` (which could resurrect a session the server just rejected) — it signs out instead.

### 🐛 Bug Fixes

- Fix `injectPaginatedQuery()` discarding a server-rendered/transferred first page: the Convex client's initial `LoadingFirstPage` emission after hydration no longer clobbers it, so the content no longer flashes to a loading skeleton.
- Fix a spurious `"Convex auth sync failed"` internal error that `injectAuth()` recorded on every SSR render; the auth-clear path now respects the disabled SSR client instead of throwing from it.
- Fix `convexQueryResolver()`: dispose is now idempotent, so the keep-warm timer and route destroy can no longer double-unsubscribe and tear down a co-located `injectQuery()`'s live subscription; a scope destroyed before the first result now resolves the navigation promise with `undefined` instead of hanging it.
- `convex-angular/better-auth`: fix three stale-async races in `BetterAuthService` — a sign-out during an in-flight session refresh is no longer reverted by the stale response, a superseded token request can no longer overwrite a fresher cached token, and a genuine session error is no longer cleared by a later successful token exchange.

## [1.9.0](https://github.com/azhukaudev/convex-angular/compare/v1.8.0...v1.9.0) (2026-07-10)

### ✨ Features

- Add `createConvexAuthGuard(...)` for claims-based route protection: an optional `allow` check receives the current JWT and its decoded claims (via `injectAuth().getAuth()`) and can redirect failures to `forbiddenRoute`. When a rejected token is refreshing, the guard waits for the refresh to settle so claims are never stale.
- Add `convexUnauthGuard` for signed-out-only routes (login, registration); it redirects authenticated users to `authenticatedRoute` from `CONVEX_AUTH_GUARD_CONFIG` (default `/`).
- Make `convexAuthGuard` usable in both `canActivate` and `canMatch` (prefer `canMatch` for lazy routes so the protected bundle is never downloaded when unauthenticated), preserve the redirect target through router redirects, and treat a token refresh as authenticated instead of bouncing to login.
- Add `placeholderData` to `injectQuery(...)` — a value or args factory shown in `data()` while the first result loads (e.g. seeding a detail view from a list item). It never marks the query successful (`status()` stays `'pending'`, `isPlaceholderData()` is `true`, `onSuccess` does not fire) and is cleared on error.
- Add `isRefetching()` and `isPlaceholderData()` signals to `injectQuery(...)` so a lightweight "refreshing" affordance can replace a full skeleton during resubscribes.
- Change `injectPrewarmQuery().prewarm(...)` to return `Promise<boolean>` that resolves `true` once the warm subscription receives its first result, and `false` when it fails, expires, or runs during server-side rendering. Still fire-and-forget when ignored.

### ⚠️ Breaking Changes

- Raise the `convex` peer dependency floor to `>=1.42.1` so the `initialAuthTokenReuse` client option is always available (and typed) through `provideConvex(...)`.

### 🐛 Bug Fixes

- Add an optional `sessionId` signal to `ClerkAuthProvider` and include it in the values that re-trigger Convex auth setup. Without it, signing out and back in replaces the Clerk session while Convex keeps fetching tokens for the dead session, leaving auth loaded but unauthenticated until the app reloads. Ports the upstream fix from `convex/react-clerk` (get-convex/convex-js#156); expose `sessionId` from your Clerk service to benefit.

### 📖 Documentation

- Document claims-based guards, `convexUnauthGuard`, `canMatch` usage, `placeholderData`/`isRefetching`, and the `prewarm(...)` promise in both READMEs.
- Document the `initialAuthTokenReuse` client option: reusing the cached auth token on startup avoids a second `Authenticate` message that makes the server re-execute all authenticated queries.

## [1.8.0](https://github.com/azhukaudev/convex-angular/compare/v1.6.0...v1.8.0) (2026-06-10)

### ✨ Features

- Add zero-config server-side rendering and hydration support: on the server, `injectQuery()` and `injectQueries()` fetch over HTTP (SSR serialization waits via `PendingTasks`) and transfer results through `TransferState`; hydrated clients render instantly from the transferred data before the live subscription takes over. `injectPaginatedQuery()` fetches and transfers its first page. Configure via the new `ssr` option on `provideConvex(...)` (`fetchOnServer`, `authToken` for authenticated SSR).
- Add `convexQueryResolver()` route resolver for explicit preloading: blocks navigation until the first query result is local so the routed component renders without a loading state (the `preloadQuery`/`usePreloadedQuery` equivalent).
- Add a `convex-angular/testing` entry point with `MockConvexClient` and `provideConvexTesting()` for unit-testing components without a real Convex deployment: capture and drive subscriptions, settle mutations/actions, push connection state, and pre-seed the warm cache.
- Add token refreshing state to `injectAuth()` (`isRefreshing()` and a `'refreshing'` status) plus a `*cvaAuthRefreshing` directive for layering a "reconnecting" affordance over authenticated content.
- Add `injectAuth().getAuth()` exposing a snapshot of the current JWT and its decoded claims.
- Add per-key `onSuccess`/`onError` callbacks and a `refetch()` method to `injectQueries()`.
- Re-export `ConvexError` and add a `sortByField(...)` helper for building `insertAtPosition(...)` sort keys.

### ⚠️ Breaking Changes

- Raise the `convex` peer dependency floor to `>=1.41.0` and add `@angular/common` as a peer dependency.

### 🐛 Bug Fixes

- Preserve the return URL when `convexAuthGuard` redirects to the login route.
- Surface token fetch errors from auth integrations through `injectAuth().error()`.
- Stop mutation and action state updates (and callbacks) after the owning Angular scope is destroyed; the returned promise still settles.
- Reset paginated queries correctly after first-page errors.
- Fix `injectQuery()` warm-cache hydration when arguments change.
- Make `injectConvexConnectionState()` and `injectPrewarmQuery()` safe on disabled (server-side) Convex clients.
- Throw an actionable error naming the `injectRef` escape hatch when a helper is created outside an injection context.

### 📖 Documentation

- Add Quick Links navigation, a testing guide, a `ConvexError` handling section, a full server-side rendering section (setup, authenticated SSR, per-helper behavior), and an Auth0 organization-reauth note to both READMEs, and keep them in sync.

## [1.6.0](https://github.com/azhukaudev/convex-angular/compare/v1.5.0...v1.6.0) (2026-03-12)

### ✨ Features

- Add `injectQueries()` for keyed multi-query subscriptions with per-key `results()`, `errors()`, `statuses()`, and aggregate `isLoading()`.
- Add `injectPrewarmQuery()` to warm the local Convex cache before navigation or other anticipated UI work.
- Add `injectConvexConnectionState()` for reactive Convex connection diagnostics.
- Add paginated optimistic update helpers for updating cached paginated query results during optimistic mutations.

### ⚠️ Breaking Changes

- Enforce root-only `provideConvexAuth()` registration by throwing on duplicate or nested auth provider setup.

### 🐛 Bug Fixes

- Ignore stale `injectQuery()` subscription callbacks so outdated responses do not overwrite newer state.
- Ignore stale `injectPaginatedQuery()` callbacks and throw a clear error when experimental paginated query support is unavailable on the Convex client.
- Scope Convex auth state to the root injector to prevent inconsistent auth sync across nested provider scopes.

### 📖 Documentation

- Document `injectQueries()`, `injectPrewarmQuery()`, `injectConvexConnectionState()`, and paginated optimistic update helpers in both READMEs.
- Add new frontend examples for multi-query subscriptions, connection state, prewarming queries, and paginated optimistic updates.

## [1.5.0](https://github.com/azhukaudev/convex-angular/compare/v1.4.0...v1.5.0) (2026-03-08)

### ⚠️ Breaking Changes

- Change `injectQuery()`, `injectMutation()`, and `injectAction()` so `data()` is typed as `T | undefined`, matching the existing initial, skipped, and reset runtime states.

### 🐛 Bug Fixes

- Make `injectMutation().mutate()` and `injectAction().run()` reject on failure after updating the reactive error state.
- Ignore stale mutation and action completions so only the latest invocation updates reactive state.

### 📖 Documentation

- Document rejected promise behavior for `mutate()` and `run()` in both READMEs.
- Document the corrected `data()` typing in both READMEs.

## [1.4.0](https://github.com/azhukaudev/convex-angular/compare/v1.3.0...v1.4.0) (2026-03-07)

### ✨ Features

- Rework `injectAuth()` auth sync so `status()` stays loading until Convex confirms the current token with the backend
- Extend `ConvexAuthProvider` with optional `reauthVersion` and `error` signals, and update built-in Clerk/Auth0 integrations to wire auth sync through `provideConvexAuth()` automatically

### 📖 Documentation

- Clarify `injectAuth()` loading/authenticated/error semantics and document the optional `ConvexAuthProvider` reauth/error hooks in both READMEs

## [1.3.0](https://github.com/azhukaudev/convex-angular/compare/v1.2.0...v1.3.0) (2026-03-07)

### ✨ Features

- Add optional `injectRef` support to all public `inject*` helpers so they can be created outside the initial Angular injection context

### 📖 Documentation

- Document `injectRef` usage for creating helpers outside the initial injection context.

## [1.2.0](https://github.com/azhukaudev/convex-angular/compare/v1.1.0...v1.2.0) (2026-03-07)

### ⚠️ Breaking Changes

- `injectPaginatedQuery(...)` now takes a plain options object, `initialNumItems` accepts `number | Signal<number>`, and the legacy `() => options` form was removed.

### 📖 Documentation

- Update README and JSDoc examples to use object-form `injectPaginatedQuery(...)` options and signal-based `initialNumItems`.

## [1.1.0](https://github.com/azhukaudev/convex-angular/compare/v1.0.4...v1.1.0) (2026-03-04)

### ✨ Features

- Enforce root-only Convex setup by validating `provideConvex(...)` registrations and throwing on duplicate or nested provider scopes.

### ⚠️ Breaking Changes

- `provideConvex(...)` now returns `EnvironmentProviders` and must be configured exactly once in root app providers.

### 📖 Documentation

- Clarify root-only `provideConvex(...)` setup requirements in package and repository READMEs.

## [1.0.4](https://github.com/azhukaudev/convex-angular/compare/v1.0.3...v1.0.4) (2026-02-16)

### 📖 Documentation

- Refresh README examples and fix inconsistencies (requirements note, safer `injectQuery`, updated pagination/guard snippets, auth examples now use `useExisting`, repo dev commands).

## [1.0.3](https://github.com/azhukaudev/convex-angular/compare/v1.0.2...v1.0.3) (2026-02-14)

### ✨ Features

- Add `provideConvexAuthFromExisting(...)` to wire `CONVEX_AUTH` to an existing injectable auth provider instance (avoids accidental duplicate instances)

### 📖 Documentation

- Update Custom Auth Provider examples to use `useExisting` and warn that `useClass` can create a second instance so auth signal changes won’t reach Convex auth sync
- Add a `@convex-dev/auth` integration snippet and clarify that `provideConvexAuth()` handles `setAuth`/`clearAuth` automatically when `isAuthenticated` changes
- Align JSDoc auth provider/token examples to prefer `useExisting`

## [1.0.2](https://github.com/azhukaudev/convex-angular/compare/v1.0.1...v1.0.2) (2026-01-27)

### 🐛 Bug Fixes

- Clear Convex auth when the provider is loading or unauthenticated to avoid stale tokens
- Auto-initialize auth sync when registering auth providers so queries refresh on sign-in/out

### 📖 Documentation

- Document automatic auth sync initialization and logout behavior

## [1.0.1](https://github.com/azhukaudev/convex-angular/compare/v1.0.0...v1.0.1) (2026-01-26)

### 🐛 Bug Fixes

- Prevent double unsubscribe when toggling `skipToken`, avoiding Convex `numSubscribers` errors in `injectQuery` and `injectPaginatedQuery`

## [1.0.0](https://github.com/azhukaudev/convex-angular/compare/v0.4.1...v1.0.0) (2026-01-11)

### ✨ Features

**Authentication System**

- Complete auth integration with `injectAuth()` provider
- Route guard `convexAuthGuard` for protecting routes with configurable redirect
- Auth directives: `*cvaAuthenticated`, `*cvaUnauthenticated`, `*cvaAuthLoading` for template-based auth UI

**Auth Provider Integrations**

- **Clerk**: Built-in support via `provideClerkAuth()` and `CLERK_AUTH` token
- **Auth0**: Built-in support via `provideAuth0Auth()` and `AUTH0_AUTH` token
- **Custom**: Support for any auth provider via `provideConvexAuth()` and `CONVEX_AUTH` token

**Query Enhancements**

- Conditional queries with `skipToken` support in `injectQuery` and `injectPaginatedQuery`
- Added `isSkipped`, `isSuccess`, `status`, and `refetch()` to `QueryResult`
- Performance optimization using `untracked()` for cache lookups

**Paginated Queries**

- New `injectPaginatedQuery()` for infinite scroll and pagination
- Signals: `results`, `canLoadMore`, `isLoadingMore`, `isExhausted`, `isSkipped`, `isSuccess`, `status`
- Methods: `loadMore(numItems)`, `reset()`

**Mutations & Actions**

- Added `status` and `isSuccess` signals to `MutationResult` and `ActionResult`
- Added `reset()` method for state management

### 📖 Documentation

- Added AGENTS.md with instructions for AI coding assistants

## [0.4.1](https://github.com/azhukaudev/convex-angular/compare/v0.4.0...v0.4.1) (2025-12-16)

### 📖 Documentation

- Update links

## [0.4.0](https://github.com/azhukaudev/convex-angular/compare/v0.3.0...v0.4.0) (2025-12-16)

### 🏡 Chore

- Update Convex to v1.31.0
- Update Nx to v22.2.4

## [0.3.0](https://github.com/azhukaudev/convex-angular/compare/v0.2.0...v0.3.0) (2025-08-01)

### 📖 Documentation

- Update README.md

### 🏡 Chore

- Update Angular to v20.1.4
- Update Nx to v21.3.10

## [0.2.0](https://github.com/azhukaudev/convex-angular/compare/0.1.0...v0.2.0) (2025-07-20)

### 📖 Documentation

- Update README.md with more examples

## 0.1.0 (2025-07-18)

- Initial release 🎉
