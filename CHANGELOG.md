# convex-angular

## Unreleased

### 🐛 Bug Fixes

- `injectPrewarmQuery()` / `convexQueryResolver()`: query args the Convex client cannot serialize (a `Date`, a `Map`, a class instance, or an `undefined` inside an array) no longer break the helper. `prewarm()` threw synchronously instead of resolving `false`, and the resolver rejected the navigation instead of resolving `undefined`. Worse, the failed subscribe left a destroy hook behind that threw when its scope was destroyed, which skipped every destroy hook registered after it on that scope. `prewarm()` now resolves `false` and reports the failure through `onError`, and the resolver resolves `undefined`; on this path both settle one microtask later than a subscription that opened, because the failure is reported from a microtask rather than inside the call.
- The auth setup errors thrown by `injectAuth()` and `provideConvexAuth()` ("Could not find Convex auth state" and "Could not find `CONVEX_AUTH`") now name every provider helper that fixes them, including `provideBetterAuth()` and `provideConvexAuthFromExisting()`, which the messages previously omitted.
- `convex-angular/better-auth`: `refreshSession()` now retries Convex authentication when the last token exchange failed. Convex gives up on auth after a failed exchange and does not ask again until the next `setAuth()`, and since the 1.11.0 change that stopped a same-session refresh from re-authenticating, one transient exchange failure left `injectAuth().status()` at `'unauthenticated'` (while `injectBetterAuth().isAuthenticated()` was `true`) until a reload or a new sign-in. A same-session `refreshSession()` after a failed exchange now re-registers Convex auth once; a refresh after a healthy exchange still leaves Convex untouched.
- The published package now includes the MIT `LICENSE` file. Earlier releases, including 1.11.0, declared `"license": "MIT"` in `package.json` but shipped no license text in the tarball. The release workflow now fails when the built package has no `LICENSE`.
- `injectQueries()`: `QueriesDefinition` is now typed `Record<string, QueryRequest | SkipToken>` instead of using `QueryRequest<any>`. A definition that compiled before can stop compiling: a reference to an internal (non-public) query is now rejected, and so is a reference that is not a query at all (a mutation or an action); neither could ever run as a client query.
- `convex-angular/testing`: `MockConvexClient.onUpdate()` and `onPaginatedUpdate_experimental()` now throw for args the real client rejects (a `Set`, a `Map`, a `Date`, a class instance, an `undefined` inside an array, or a `$`-prefixed field name) and record no subscription, instead of accepting them. A test could previously pass against the mock where the same code throws against a deployment; a test that passed such args to the mock will now throw. A `disabled` mock still accepts anything, like the real disabled client.

### 📖 Documentation

- Document a hazard of `injectPaginatedQuery()` in the browser: when a page query of a paginated query fails on the server, the Convex client throws inside its own transition handling, so the helper never reports it (`error()` stays `undefined` and `onError` is not called), every update listener registered after it, including other `injectQuery()` calls, stops receiving updates until the failed subscription is torn down, and `reset()` resubscribes into an error that goes to Angular's `ErrorHandler` and leaves the new subscription unreleased. `onError` fires only for the first-page fetch during server-side rendering. Make paginated query functions return an empty page for expected failures instead of throwing.
- Correct the `refetch()` documentation to match the real Convex client: it replays the previous result (a value or an error) on the next macrotask before the server answers, and sends no request when another subscriber holds the same query and arguments.
- Correct the 1.11.0 changelog: the Angular-floor note said the release "ships as 2.0.0", but it shipped as 1.11.0 (Angular 21 projects should stay on `convex-angular@~1.10.0`).
- `reference/errors`: stop suggesting that `provideConvexAuthFromExisting()` be registered alongside `provideConvexAuth()` (it already includes it), and document the `MockConvexClient.requireLastAuthRegistration()` error.
- Fix the Auth0 example (docs page and `provideAuth0Auth()` TSDoc): it awaited `AuthService.getAccessTokenSilently()`, which returns an Observable, so the id token was never read. It now unwraps it with `firstValueFrom()`, and the type-checked docs example models the real `AuthService` shape (Observables) instead of Signals and Promises.
- Fix the prewarming example: it awaited `prewarm()` in a click handler on the same element as `routerLink`, which navigates regardless; the awaited variant now lives on a button.
- The documentation site is now published at https://convex-angular.vercel.app/. The README, the package `homepage` and a new `bugs` URL link to it and to the issue tracker.

### 🏡 Chore

- Run the mutation suite on pushes to `main` as well as pull requests (it only ran on pull requests, so direct pushes were never mutation-tested), and stop a Dependabot bump of `ci.yml` from forcing a full mutation run (contributors only; the published package is unaffected).
- Clear the Verdaccio and undici advisories from the workspace's dev toolchain: `verdaccio`, which `@nx/js` only lists as an optional peer, is no longer installed; `undici` is patched in both copies (the Nx one through an override until Nx 24.0.4, the Astro one through an in-range refresh); and the unused `material-symbols` dependency is gone, since the demo self-hosts its icon subset (contributors only; the published package is unaffected).
- Enable `@typescript-eslint/no-explicit-any` for the library and replace its remaining uses; extend the `src/lib/internal` boundary lint rule so `*_experimental` client members, like `BaseConvexClient`, can only be used in `convex-client-internals.ts` (contributors only; the published package is unaffected).
- Delete the unused `resolveEnvironmentInjector` helper, move the `@internal` tag of `ɵrunInResolvedInjectionContext` onto its declaration so the published `.d.ts` carries it, and remove the unused `release` blocks from `nx.json` and `project.json`. (contributors only; the only published difference is the `@internal` tag now carried by the `.d.ts`).
- `convex-angular/better-auth`: track the token-exchange outcome in the single `cachedToken` field (`undefined` / `null` / the token) instead of a parallel `tokenExchangeFailed` flag, and split the 1,000-line service spec around one shared test double (contributors only; the published package is unaffected).
- Simplify the CI change detection: `ci-changes.mjs` now matches the `mutate` globs of `stryker.config.mjs` with Node's `path.matchesGlob`, applied in Stryker's own order, instead of parsing a fixed set of pattern shapes; the `changes` job pins Node from `.nvmrc`; and two redundant `knip` entries and five repeated workflow comments are removed (contributors only; the published package is unaffected).
- Merge the `src/lib/internal` boundary lint rule's four repeated selectors into two, correct the `@internal` note on `runInResolvedInjectionContext` (it is used throughout the main entry point, not only by the secondary entry points), and tidy the real-client contract spec: shared helpers at file scope, one duplicated test folded into its successor, and a header telling maintainers what to update when the characterized `convex` behavior changes (contributors only; the only published difference is the reworded `@internal` comment in the `.d.ts`).

## [1.11.0](https://github.com/azhukaudev/convex-angular/compare/v1.10.0...v1.11.0) (2026-11-06)

### ✨ Features

- Add an auth surface to `convex-angular/testing`'s `MockConvexClient`, so components using `injectAuth()` can be tested against it: `client.setAuth()` records a `MockAuthRegistration` (`authRegistrations`, `lastAuthRegistration()`) whose `fetchToken()`, `setAuthenticated()` and `setRefreshing()` play the client's side of the handshake, `seedAuth()` gives the client the token that `getAuth()` reports and that makes `client.hasAuth()` true, and `clearAuthCount`/`hasAuthCount` record the calls. The surface was previously an inert no-op with `hasAuth()` hard-coded to `false`.
- Add `MockConvexClient.query()` for one-shot reads, following the real client: a warm-cache hit seeded by `seedQueryResult()` resolves immediately, and a miss opens a subscription that stays pending until the test settles it.
- Add capture surfaces to `MockConvexClient` for assertions that previously needed a hand-rolled spy — `MockCallableCall.options` (the `{ optimisticUpdate }` object `injectMutation()` forwards), `localQueryResultCalls`, per-subscription `unsubscribeCount`, and `connectionStateReads`/`connectionStateSubscriptions`/`connectionStateUnsubscribes` — plus `refusedSubscriptions`, which records the subscriptions a disabled client skips so their absence is provable. The `client` getter now returns a stable object, so `jest.spyOn(convex.client, ...)` works for error paths the mock cannot arm itself.
- Add `emitAfterUnsubscribe()`/`emitErrorAfterUnsubscribe()` to both `MockConvexClient` subscription records, for tests that target a helper's defensive staleness guard. The real client removes its listener synchronously on unsubscribe and can never deliver there, so these assert against behaviour a deployment does not produce.
- Add `MockConvexClient.seedQueryError()` to seed the warm cache with a failed result: `client.localQueryResult()` throws it, and `query()` rejects with it, matching the real client's behavior for a warmed query that failed on the server.
- Add `MockConvexAuthProvider` and `provideConvexAuthTesting()` to `convex-angular/testing`: a driveable `ConvexAuthProvider` double (`setLoading()`, `signIn()`/`signOut()`, `setError()`, `bumpReauth()`, `failNextFetch()`) plus one-call registration under `CONVEX_AUTH` alongside `provideConvexAuth()`, so `injectAuth()`, the auth directives, and the route guards no longer need a hand-rolled `ConvexAuthProvider` literal in every test. The double is deliberately inert — it never flips its own state, so `MockAuthRegistration` still drives Convex's side of the handshake.
- `convex-angular/testing`: `MockCallableCall.reject()` now accepts any rejection value (`unknown`), not only an `Error`.
- `convex-angular/testing`: add `MockConvexClient.requireLastAuthRegistration()`, which returns the latest auth registration or throws when `setAuth` was never called, so tests no longer narrow `lastAuthRegistration()` by hand.

### ⚠️ Breaking Changes

- Requires Angular `>=22.2.1 <23.0.0` for `@angular/common`, `@angular/core`, and `@angular/router` (1.10.0 declared `>=21.2.17` with no upper bound). The package is built with the Angular 22 toolchain and its partial-Ivy output is not consumable by Angular 21 apps, so consumers must upgrade Angular; building then needs TypeScript 6.0 (`@angular/compiler-cli` peers `typescript >=6.0 <6.1`) and a Node version Angular 22 supports (`^22.22.3 || ^24.15.0 || >=26.0.0`). The floor sits at 22.2.1 because it patches high-severity advisories in earlier 22.x releases — three `@angular/router` denial-of-service advisories in server-side rendering (GHSA-62vg-58rm-qff7, GHSA-57xq-rjx2-v5xh, GHSA-ff3f-86qr-9cv3; one makes the router re-run `canMatch` guards and route resolvers per crafted URL segment, which amplifies `convexAuthGuard` and `convexQueryResolver` work on the server), an i18n XSS in `@angular/core`/`@angular/compiler` (GHSA-jj27-h5hq-8x99), and an `HttpTransferCache` cache-key ambiguity that could enable cross-request response reuse, the latter landing directly on this library's SSR/TransferState feature (GHSA-jhpw-976m-542j). The Angular upper bound is new: nothing here was compiled or tested against `@angular/core@23`. This was released as 1.11.0 rather than as a new major version: projects still on Angular 21 should pin `convex-angular@~1.10.0`.
- Cap the previously unbounded `convex` peer dependency at `>=1.42.1 <2.0.0` (the floor is unchanged). Nothing here was ever compiled or tested against `convex@2.x`, so the old range let it satisfy the manifest untested. Consumers pinned outside the range must adjust.
- `convex-angular/testing`: `MockConvexClient.subscribeToConnectionState()` no longer registers the listener when the client is `disabled`, matching the real client, which returns a no-op without subscribing. Tests that pushed connection state into a disabled mock will now observe no delivery.
- `convex-angular/testing`: a disabled `MockConvexClient` (`{ disabled: true }`) now rejects `mutation()`/`action()` with `ConvexClient is disabled`, matching the real SSR client instead of silently capturing the call. This is a test-fidelity fix; tests that invoked mutations/actions against a disabled mock must now assert the rejection.
- `injectMutation().mutate()` and `injectAction().run()` no longer reject when your `onSuccess` callback throws, and a throwing `onError` no longer replaces the rejection value: a callback error is now reported to Angular's `ErrorHandler` while the operation keeps its real outcome (a committed mutation resolves and does not set `error()`). Code that relied on `mutate()` rejecting because `onSuccess` threw must handle that error inside the callback. The same isolation now applies to every helper's `onSuccess`/`onError` — see the matching bug-fix entry below.
- Cap the previously unbounded `rxjs` peer dependency to `>=7.8.0 <8.0.0`. Angular 22 itself peers `rxjs` `^6.5.3 || ^7.4.0`, and nothing here was compiled or tested against rxjs 8 or the 9 beta, whose package `exports` no longer include the `rxjs/operators` subpath this library used to import from. Consumers on rxjs 8+ must stay on rxjs 7 until a release declares support. The library now imports its operators from the `rxjs` root (supported since rxjs 7.2) and reads Angular's `Router.currentNavigation()` signal instead of the `getCurrentNavigation()` method deprecated in Angular 20.2; neither changes behavior.

### 🐛 Bug Fixes

- `injectQuery()`/`injectQueries()`: a query whose warm-cache entry is an error (the deployment already rejected this exact query + args) no longer throws from inside the subscription effect and wedges the query in `pending` forever. The helper now subscribes normally, and the client's own replay of the cached result surfaces it through `error()`; recovery stays automatic on a later server transition. `injectQueries()` also no longer aborts reconciliation of later keys when an earlier key hits this case.
- `injectPaginatedQuery()` no longer duplicates items across pages when the server splits a non-first page: the upstream fix (get-convex/convex-js#54981, `7ceee3e`) makes the first split page resume from the split page's own cursor instead of restarting from `null`. `injectPaginatedQuery()` delegates to `ConvexClient.onPaginatedUpdate_experimental`, so no convex-angular code changed — upgrade the `convex` peer dependency to `>=1.43.0` to pick it up (the declared peer floor stays at `>=1.42.1`).
- `injectQueries()`: a key removed from the definition while it was using `skipToken` no longer leaves a stale `'skipped'` entry in `results`, `errors`, and `statuses`. `isLoading()` was unaffected, but consumers iterating `Object.keys(results())` saw a key that no longer existed.
- `convex-angular/better-auth`: a superseded token exchange no longer writes shared error state — a stale failure could surface through `injectAuth().error()` even though the current request had already succeeded, and a stale success could clear an error the current request had just recorded. 1.10.0 scoped the token cache this way; the error state now matches.
- `injectMutation().mutate()`/`injectAction().run()` called from inside an Angular `effect()` no longer registers the internal version counter as a dependency of that effect and re-triggers it; the version reads are now `untracked()`.
- `injectPaginatedQuery()`'s `loadMore()` called after the owning scope is destroyed now returns `false`, matching the documented contract, instead of throwing from the retained client closure.
- Auth guards (`convexAuthGuard`, `convexUnauthGuard`, `createConvexAuthGuard()`) and `convexQueryResolver()` no longer leave a registration on the route's environment injector after every navigation. The guards leaked one live effect per check — re-run on every later auth-status change — and the resolver one destroy hook that kept the resolved value reachable, so memory and per-auth-transition work grew with navigation count in long-lived apps.
- A throwing `onSuccess`/`onError` callback no longer corrupts the operation it observes. On `injectMutation()`/`injectAction()`, an `onSuccess` throw used to mark a committed mutation as failed — `error()` set, `onError` fired, `mutate()`/`run()` rejected — and an `onError` throw replaced the rejection value; on `injectQuery()`/`injectQueries()`/`injectPaginatedQuery()` it aborted the Convex client's dispatch for every later subscriber of that update. Callback errors are now reported to Angular's `ErrorHandler` instead. The `mutate()`/`run()` change is also called out as a breaking change above.
- `provideConvex()` now forwards `skipConvexDeploymentUrlCheck` and `logger` to the `ConvexHttpClient` it creates for server-side rendering. Previously only the browser `ConvexClient` received them, so a deployment URL that needs `skipConvexDeploymentUrlCheck: true` worked in the browser but failed the server render, and a custom or disabled `logger` was ignored for server-side query logs.
- `injectAuth()`: signals an auth provider's `fetchAccessToken()` reads before its first `await` no longer become dependencies of the internal auth sync effect. The Convex client fetches the first token synchronously inside `setAuth`, so a change to such a signal (for example Clerk's `sessionAudience`) re-ran the whole auth setup, and a provider whose fetcher wrote a signal it also read could loop.
- `injectPrewarmQuery()`: a throwing `onError` callback is now reported to Angular's `ErrorHandler` instead of throwing inside the Convex client's update dispatch, matching the other helpers.
- `injectPrewarmQuery()`: calling `prewarm()` after the owning component or injector was destroyed now resolves `false` immediately without opening a subscription. Previously the background subscription stayed open for the whole `extendSubscriptionFor` window. `convexQueryResolver()` shares the same guard and resolves `undefined` in that case.
- `convex-angular/better-auth`: `refreshSession()` no longer makes Convex re-authenticate when the session has not changed. It flipped the provider to loading on every call, so `injectAuth()` cleared the client's auth and called `setAuth` again — re-running every subscription, tearing down `*cvaAuthenticated` views and making guards wait — even when Better Auth returned the same session. `provideBetterAuth()` now hands Convex auth a provider that only counts loading while no session is known; a changed session id still re-authenticates, and `injectBetterAuth().isLoading()` still reports every reload. While an already-authenticated session is re-validated, `injectAuth().status()` therefore stays `'authenticated'` instead of passing through `'loading'`. `CONVEX_AUTH` now resolves to this Convex-facing view (`BetterAuthService.convexAuth`) rather than the `BetterAuthService` instance, so code that injected `CONVEX_AUTH` and treated it as the service should use `injectBetterAuth()` instead.
- `convex-angular/better-auth`: `injectBetterAuth()` now reports the guided errors the docs describe. Called from plain code with no `injectRef` it throws the library's standard `injectBetterAuth() must be called from an injection context …` message instead of Angular's `NG0203`, and with an `injectRef` that has no `provideBetterAuth()` it throws `Could not find BetterAuthService …` instead of a raw `NullInjectorError`.
- `convexQueryResolver()`: a missing `provideConvex(...)` now raises the same guided "Could not find `CONVEX`" setup error as every other helper instead of Angular's generic `NullInjectorError`.
- `convexQueryResolver()`/`injectPrewarmQuery()`: a `keepSubscribedFor`/`extendSubscriptionFor` of `Infinity` (or any value above 2,147,483,647 ms) no longer releases the subscription immediately — `setTimeout` overflows such delays to about 0 ms. They are now capped at that limit (about 24.8 days).
- `convex-angular/better-auth`: `BetterAuthClientLike.getSessionData()` is now typed `unknown`, matching the real cross-domain client (`Record<string, unknown> | null`), so a real client no longer needs an `as unknown as` cast. The cached snapshot is validated before use; a value without a string `session.id` and `user.id` is ignored instead of being trusted as a session.

### 📖 Documentation

- The full reference moved out of the package README into the new documentation site, whose sources live at https://github.com/azhukaudev/convex-angular/tree/main/apps/docs/src/content/docs. The README (also shown on npm) is now a short overview.
- Corrected the `ssr.transferAuthenticatedResults` guidance. 1.10.0 described `false` as keeping authenticated results out of "the rendered HTML", but it only keeps them out of the TransferState payload; the markup is still rendered from the user's data, so `Cache-Control: private`/`no-store` is required whenever `authToken` applies.
- Corrected the documented `onSuccess` timing for warm-cache hits: it fires one macrotask after subscribe, from the Convex client's local replay of the cached value, not after a server round-trip. Transferred server data and `placeholderData` are unchanged. `MockConvexClient` does not replay seeded results, so tests still drive that delivery with `emit()`.
- Clarified that route guards and `createConvexAuthGuard({ allow })` are client-side navigation gating, not a security boundary; data access must be enforced in Convex functions with `ctx.auth.getUserIdentity()`. Also documented that `returnUrl` must be validated before navigating.
- Replaced the deprecated `Query['_args']`/`Action['_args']` slot with `FunctionArgs<…>` in the documented signatures, and made `check:docs` fail if it reappears in the docs content.
- Corrected more stale claims: helper options such as `onSuccess`/`onError` are read when they fire, not captured once; a route-scoped `provideConvex()` client is only closed on leaving the route when the app opts into `withAutoCleanupInjectors()`; the route-resolver example now reads route params reactively instead of from `route.snapshot`; and the entry-point table lists the real `convex-angular/better-auth` and `convex-angular/testing` exports.

### 🏡 Chore

- Move the workspace to pnpm 12.15.0 (contributors only; the published package is unaffected).
- Swap the library test toolchain from Vitest to Jest (`jest-preset-angular`).
- Add Stryker mutation testing over the published entry points (`pnpm test:mutation`).
- Migrate the library's own specs onto `MockConvexClient` and `provideConvexTesting()`; they previously hand-rolled a `jest.Mocked<ConvexClient>` literal per file, so nothing exercised the double shipped to consumers.
- Lint the workspace to zero warnings as well as zero errors, and record that as a ratchet alongside knip and jscpd.
- Bump the workspace to the Angular 22 toolchain: the framework packages (`@angular/core`, `common`, `compiler`, `forms`, `platform-browser`, `router`, `compiler-cli`, `language-service`) to `22.2.3`, the build toolchain (`@angular/build`, `@angular/cli`, `@angular-devkit/*`, `@schematics/angular`) and `@angular/cdk`/`@angular/material` to `22.2.4`, `ng-packagr` to `22.2.5`, and TypeScript to `6.0.3`; also `better-auth` to `1.6.22` (a HIGH pre-account-hijacking advisory fix) and `@convex-dev/better-auth` to `0.12.5`.
- Bump the workspace's `convex` pin to `1.45.0` and add a new internal adapter (`src/lib/internal/convex-client-internals.ts`) that gathers the library's nine `BaseConvexClient`/experimental-API access sites behind one seam, plus a contract spec that asserts each of them against a real `ConvexClient` — consumer-invisible, but it turns a convex bump that moves this surface into a caught regression instead of a silent one. `convex-angular/testing`'s `MockConvexClient` now satisfies a compile-time conformance type instead of bridging to `ConvexClient` through an unchecked `as unknown as` cast.
- Read query/action argument types through `FunctionArgs<Ref>` instead of the `Ref['_args']` slot in `injectQuery()`, `injectQueries()`, `injectAction()`, `injectPrewarmQuery()`, and `queryResolver()`. convex 1.46.0 deprecated `FunctionReference._args`/`_returnType` (get-convex/convex-js#56778) ahead of removing them; `FunctionArgs` has been an identical alias since before the `>=1.42.1` peer floor, so this is a type-level no-op for consumers and a compile-time regression avoided when the slot goes away.
- Strengthen the real-client contract spec: it now asserts that `onRefreshChange` is forwarded, that `hasAuth()` follows `setAuth`/`clearAuth`, the shape of the paginated payload, the client-injected `paginationOpts.id` (a number), and the real client's replay of a cached query error to a fresh listener, instead of only checking that each member exists. CI also runs the library tests against the `convex` peer floor (1.42.1) and the latest release.
- `convex-angular/testing`: `MockConvexClient`'s low-level client surface is now type-checked against the real `BaseConvexClient`, so a drifted internal signature fails to compile. `AuthTokenFetcher` is now an alias of the identical type exported by `convex/browser`. No consumer-visible change.
- Bump the workspace to Angular `22.2.4` (framework packages) and `22.2.5` (build toolchain), with `@angular/cdk`/`@angular/material` at `22.2.6` — `@angular/build@22.2.5` pins `vite@8.3.5` instead of the vulnerable `8.3.0` — plus `convex` `1.49.0` (the adapter's contract spec passes unchanged) and Jest `30.5.2` (one `@jest/environment` copy instead of a 30.4/30.5 split), refresh in-range transitive dependencies for security advisories (`pnpm audit`: 168 → 67 findings), and remove the unused Verdaccio local registry. Contributors only; the published package and its peer ranges are unchanged.
- Move the demo app to `@convex-dev/better-auth` `0.13.0` and `better-auth` `1.7.17`, which clears the critical and high `better-auth` advisories the demo was held on and picks up the adapter's own cross-domain and origin-check security fixes. Contributors only; the `convex-angular/better-auth` entry point has no Better Auth dependency and is unchanged.
- Move the workspace linter to ESLint `10.14.0` (`@eslint/js` `10.0.1`); ESLint 9.39.x is marked unsupported on npm and every lint plugin in the workspace already allows ESLint 10. ESLint 10's `eslint:recommended` adds `no-unassigned-vars`, `no-useless-assignment` and `preserve-caught-error`; none of them fired on the workspace, so no source changed. The workspace stays at zero lint errors and warnings. Contributors only.
- Make the CI and local gates agree (contributors only; the published package is unaffected): the demo build is now Nx-cached and keyed on its `NG_APP_*` environment variables, `pnpm verify:ci`/`verify:full` and the pre-push hook now include `pnpm typecheck:spec` (CI and the release workflow no longer run it as a separate step), the pre-commit hook now formats `scss`/`cjs`/`cts`/`mts` files, and the CI `convex` peer-range leg tests the newest `1.x` release instead of `latest` and is no longer allowed to fail silently.
- Harden the release workflow (contributors only; the published package is unaffected): it is now a read-only `verify` job (install, full gate, library build, dry run) plus a separate `publish` job that alone holds `id-token: write`, the `Production` environment and `NPM_TOKEN` and installs nothing from the workspace; `workflow_dispatch` runs can no longer reach `Production`; and every action in `release.yml` and `ci.yml` is pinned to a commit SHA, matching `advisories.yml`. Tag pushes also refuse to publish a commit that is not on `main`.
- Add three contributor-side ratchets (contributors only; the published package is unaffected): runtime export-list specs for the `convex-angular`, `convex-angular/testing` and `convex-angular/better-auth` entry points, an ESLint rule that keeps `BaseConvexClient`/`ConvexClient.client` inside `src/lib/internal/`, and a `tsconfig.base.json` cleanup (the dead `target`/`module`/`lib` values now match what every project already used, the repeated `moduleResolution`/`module` settings were removed, `emitDecoratorMetadata` is now off in the base instead of in each Angular config, and the `noUncheckedSideEffectImports: false` pin was dropped).
- Enforce the formatting and dependency-age gates (contributors only): `pnpm format:check` now runs first in `verify:ci`/`verify:full`, and pnpm's 1-day `minimumReleaseAge` cooldown is explicit and strict, so CI installs fail instead of silently accepting a version published less than a day ago.
- Add a weekly CI workflow that fails when a security advisory affects one of the library's declared peer-dependency floors, and reports the workspace's full `pnpm audit` as a summary.
- Fix the TypeScript 6 deprecations in the workspace's tsconfig files (`baseUrl`, `esModuleInterop: false`, `moduleResolution: node`) instead of silencing them with `ignoreDeprecations`. The built package is unchanged.
- Bump the documentation site to Astro `7.4.5`, Starlight `0.42.8` and the Vercel adapter `11.0.18`, which clears the Astro critical and XSS advisories (contributors only).
- Demo app: the Better Auth backend now refuses to start when `SITE_URL`, `BETTER_AUTH_SECRET` or `CONVEX_SITE_URL` is missing instead of running with an empty value; the Material Symbols icon font is a self-hosted 3 KB subset instead of the 4 MB font; and the `/auth` routes share one Convex client and Better Auth stack instead of creating one per route.
- Speed up and harden CI (contributors only): the mutation suite runs on pull requests only and mutates just the library files a pull request touched (a full run when shared config or the lockfile changes; skipped when no library file changed), the `convex` peer-range job is skipped for pull requests that cannot affect the library, every job has a time limit, a new `actionlint` job checks the workflow files, and Dependabot keeps the pinned GitHub Actions up to date.
- The primary entry point now also exports `ɵrunInResolvedInjectionContext`, so `convex-angular/better-auth` shares the library's injection-context handling instead of a copy. The `ɵ` prefix marks it as not public API: do not depend on it.

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
