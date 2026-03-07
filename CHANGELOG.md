# convex-angular

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
