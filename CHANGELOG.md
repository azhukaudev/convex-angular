# convex-angular

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
