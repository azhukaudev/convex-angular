# convex-angular

[![NPM version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![GitHub license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
[![NPM downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)

The Angular client for Convex.

## ✨ Features

- 🔌 Core providers: `provideConvex`, `injectQuery`, `injectQueries`, `injectPrewarmQuery`, `injectPreloadedQuery`, `injectMutation`, `injectAction`, `injectPaginatedQuery`, `injectConvex`, and `injectConvexConnectionState`
- 🧊 SSR helpers: `preloadQuery`, `fetchQuery`, `fetchMutation`, `fetchAction`, `transferPreloadedQuery`, and `readTransferredPreloadedQuery`
- 🔐 Authentication: Built-in support for Clerk, Auth0, and custom auth providers via `injectAuth`
- 🛡️ Route Guards: Protect routes with `convexAuthGuard`
- 🎯 Auth Directives: `*cvaAuthenticated`, `*cvaUnauthenticated`, `*cvaAuthLoading`
- 📄 Pagination: Built-in support for paginated queries with `loadMore` and `reset`
- ⚡ Optimistic pagination helpers: `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`
- ⏭️ Conditional Queries: Use `skipToken` to conditionally skip queries
- 📡 Signal Integration: [Angular Signals](https://angular.dev/guide/signals) for reactive state
- 🧹 Auto Cleanup: Automatic lifecycle management for subscriptions and helper-owned reactive state

## 🚀 Getting Started

> Requirements: Angular >= 20, Convex >= 1.31, RxJS >= 7.8.

1. Install the dependencies:

```bash
npm install convex convex-angular
```

2. Add `provideConvex` once to your root `app.config.ts` providers:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex('https://<your-convex-deployment>.convex.cloud')],
};
```

`provideConvex(...)` must be configured only once at the root application level.
Do not register it again in nested or route-level providers.
The underlying browser `ConvexClient` is created lazily, so simply configuring
or injecting it does not open a connection until a query, mutation, action,
auth sync, or connection-state subscription actually uses it.

3. 🎉 That's it! You can now use the injection providers in your app.

## 📖 Usage

> Note: In the examples below, `api` refers to your generated Convex function references (usually from `convex/_generated/api`). Adjust the import path to match your project structure.

### Fetching data

Use `injectQuery` to fetch data from the database.

```typescript
import { Component } from '@angular/core';
import { injectQuery } from 'convex-angular';

// Adjust the import path to match your project structure.
import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `
    @if (todos.isLoading()) {
      <p>Loading...</p>
    }

    @if (todos.error()) {
      <p>Error: {{ todos.error()?.message }}</p>
    }

    <ul>
      @for (todo of todos.data() ?? []; track todo._id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
  `,
})
export class AppComponent {
  readonly todos = injectQuery(api.todos.listTodos, () => ({ count: 10 }));
}
```

`data()` is typed as `T | undefined`. Handle the initial/skipped state with
`?.` or `??` until the first successful result arrives.
Warm cache hits for the current identity can resolve immediately into a
successful state.
When the query arguments change, `data()` follows the next query identity: if
the new arguments are not warm-cached yet it becomes `undefined` until that new
subscription produces data. This matches `convex/react` query identity
behavior.

### Fetching multiple queries

Use `injectQueries` when you need to subscribe to a dynamic set of keyed queries
and read their results together.

```typescript
import { Component, signal } from '@angular/core';
import { injectQueries, skipToken } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-dashboard',
  template: `
    @if (queries.isLoading()) {
      <p>Loading dashboard...</p>
    }

    @if (queries.statuses().user === 'success') {
      <p>Welcome back, {{ queries.results().user?.name }}</p>
    }

    <ul>
      @for (todo of queries.results().todos ?? []; track todo._id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
  `,
})
export class DashboardComponent {
  readonly userId = signal<string | null>('user-1');

  readonly queries = injectQueries(() => ({
    user: this.userId() ? { query: api.users.getProfile, args: { userId: this.userId() } } : skipToken,
    todos: { query: api.todos.listTodos, args: { count: 10 } },
  }));
}
```

The multi-query result provides:

- `results()` - Keyed query results
- `errors()` - Keyed query errors
- `statuses()` - Keyed query statuses
- `isLoading()` - True while any active query is pending

When a keyed query changes to a new uncached identity, that key resets to
`undefined` + `'pending'` immediately instead of retaining the previous key's
value. This matches `convex/react` keyed query semantics.

### Prewarming queries

Use `injectPrewarmQuery` to warm the local Convex cache before a route
transition or other UI work that is likely to need a query soon.

```typescript
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { injectPrewarmQuery } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-users',
  template: ` <button (click)="openProfile('user-1')">Open profile</button> `,
})
export class UsersComponent {
  private readonly router = inject(Router);
  readonly prewarmProfile = injectPrewarmQuery(api.users.getProfile);

  openProfile(userId: string) {
    this.prewarmProfile.prewarm({ userId });
    void this.router.navigate(['/users', userId]);
  }
}
```

By default the warm subscription stays alive for 5 seconds. Override that with
`extendSubscriptionFor` when needed.

### Mutating data

Use `injectMutation` to mutate the database.

```typescript
import { Component } from '@angular/core';
import { injectMutation } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: ` <button (click)="addTodoItem()">Add Todo</button> `,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todos.addTodo);

  async addTodoItem() {
    try {
      await this.addTodo({ title: 'Buy groceries' });
    } catch (error) {
      console.error(error);
    }
  }
}
```

The mutation helper is callable directly. Call `await addTodo({ title: '...' })` to execute.

The helper rejects on failure. `error()` and `status()` are still updated, and
`onError` still runs before the promise rejects.

`data()` is typed as `T | undefined` and stays undefined until the first
successful mutation result or after `reset()`.

If the owning Angular scope is destroyed while a mutation is in flight, the
returned promise still settles, but the helper stops updating its reactive
state and stops firing `onSuccess` / `onError`.

#### Optimistic updates

Use `.withOptimisticUpdate(...)` to configure optimistic updates for instant UI feedback:

```typescript
const optimisticAddTodo = addTodo.withOptimisticUpdate((localStore, args) => {
  const todos = localStore.getQuery(api.todos.list, {});
  if (todos) {
    localStore.setQuery(api.todos.list, {}, [...todos, { ...args, _id: 'temp' }]);
  }
});

await optimisticAddTodo({ title: 'Buy groceries' });
```

Each call to `.withOptimisticUpdate(...)` creates a new helper with independent state.

### Running actions

Use `injectAction` to run actions.

```typescript
import { Component } from '@angular/core';
import { injectAction } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="completeAll()">Complete All Todos</button>`,
})
export class AppComponent {
  readonly completeAllTodos = injectAction(api.todoFunctions.completeAllTodos);

  async completeAll() {
    try {
      await this.completeAllTodos({});
    } catch (error) {
      console.error(error);
    }
  }
}
```

The action helper is callable directly. Call `await completeAllTodos({})` to execute.

The helper rejects on failure. `error()` and `status()` are still updated, and
`onError` still runs before the promise rejects.

`data()` is typed as `T | undefined` and stays undefined until the first
successful action result or after `reset()`.

If the owning Angular scope is destroyed while an action is in flight, the
returned promise still settles, but the helper stops updating its reactive
state and stops firing `onSuccess` / `onError`.

### SSR and hydration

Use `preloadQuery()` on the server to fetch and serialize a query result, then
transfer it through Angular `TransferState` and hydrate it on the client with
`injectPreloadedQuery()`.

```typescript
import { Component, TransferState, inject } from '@angular/core';
import {
  injectPreloadedQuery,
  injectQuery,
  preloadQuery,
  preloadedQueryResult,
  readTransferredPreloadedQuery,
  transferPreloadedQuery,
} from 'convex-angular';

import { api } from '../convex/_generated/api';

export async function preloadTodo(transferState: TransferState) {
  const preloaded = await preloadQuery(api.todos.getTodo, { id: 'todo-1' });
  transferPreloadedQuery(preloaded, transferState);
}

@Component({
  selector: 'app-root',
  template: `
    @if (todo.data(); as todoData) {
      <p>{{ todoData.title }}</p>
    } @else {
      <p>Loading...</p>
    }
  `,
})
export class AppComponent {
  private readonly transferState = inject(TransferState);
  private readonly preloaded = readTransferredPreloadedQuery(api.todos.getTodo, this.transferState, { id: 'todo-1' });

  readonly todo = this.preloaded
    ? injectPreloadedQuery(api.todos.getTodo, this.preloaded)
    : injectQuery(api.todos.getTodo, () => ({ id: 'todo-1' }));
}
```

`injectPreloadedQuery()` returns the server data immediately through `data()`.
Its `liveQuery` field exposes the underlying reactive `injectQuery()` result,
and `isHydratedFromServer()` stays true until the first live client result
arrives. `data()` being defined only means the server preload is available; use
`liveQuery.status()` and `liveQuery.error()` to inspect the live subscription.

`preloadedQueryResult()` lets you inspect a preloaded payload on the server
before sending it across `TransferState`:

```typescript
const preloaded = await preloadQuery(api.todos.getTodo, { id: 'todo-1' });
const todo = preloadedQueryResult(preloaded);
```

You can also use the standalone server helpers without preloading:

```typescript
const todo = await fetchQuery(api.todos.getTodo, { id: 'todo-1' });
// The helpers default to NEXT_PUBLIC_CONVEX_URL, or accept an explicit { url }.
// const todo = await fetchQuery(api.todos.getTodo, { id: 'todo-1' }, { url: 'https://<deployment>.convex.cloud' });

await fetchMutation(api.todos.renameTodo, { id: 'todo-1', title: 'Renamed' });
await fetchAction(api.todoFunctions.notifyTodoUpdated, { id: 'todo-1' });
```

### Paginated queries

Use `injectPaginatedQuery` for infinite scroll or "load more" patterns.
Your Convex query must accept a `paginationOpts` argument.

```typescript
import { Component } from '@angular/core';
import { injectPaginatedQuery } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `
    <ul>
      @for (todo of todos.results(); track todo._id) {
        <li>{{ todo.title }}</li>
      }
    </ul>

    @if (todos.canLoadMore()) {
      <button (click)="todos.loadMore(10)">Load More</button>
    }

    @if (todos.isExhausted()) {
      <p>All items loaded</p>
    }
  `,
})
export class AppComponent {
  readonly todos = injectPaginatedQuery(api.todos.listTodosPaginated, () => ({}), { initialNumItems: 10 });
}
```

The paginated query returns:

- `results()` - Accumulated results from all loaded pages
- `isLoadingFirstPage()` - True when loading the first page
- `isLoadingMore()` - True when loading additional pages
- `canLoadMore()` - True when the current subscription can load another page
- `isExhausted()` - True when all items have been loaded
- `isSkipped()` - True when the query is skipped via `skipToken`
- `isSuccess()` - True when the first page has loaded successfully
- `isLoading()` - True when actively loading (first page or additional pages)
- `status()` - `'loadingFirstPage' | 'loadingMore' | 'canLoadMore' | 'exhausted' | 'error' | 'skipped'`
- `error()` - Error if the query failed
- `loadMore(n)` - Load `n` more items
- `reset()` - Start a fresh pagination session from the beginning; also use this to retry first-page failures

Each helper instance owns an isolated pagination session, even when two
components use the same paginated query with the same arguments.
`injectPaginatedQuery()` also restarts from page one when pagination cursors
become invalid, warns in the console before resetting, and recovers
automatically.
Unlike React's separate experimental pagination hook export,
`convex-angular` currently exposes the stable `injectPaginatedQuery()` API only.

### Optimistic paginated updates

Use the paginated optimistic helpers with `.withOptimisticUpdate(...)` to keep infinite lists feeling instant.

```typescript
import { Component } from '@angular/core';
import { injectMutation, insertAtTop } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="createTodo()">Add Todo</button>`,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todos.addTodo).withOptimisticUpdate((localStore, args) => {
    insertAtTop({
      paginatedQuery: api.todos.listTodosPaginated,
      argsToMatch: {},
      localQueryStore: localStore,
      item: {
        _id: 'optimistic-id',
        _creationTime: Date.now(),
        title: args.title,
      },
    });
  });

  async createTodo() {
    await this.addTodo({ title: 'Buy groceries' });
  }
}
```

Available helpers:

- `optimisticallyUpdateValueInPaginatedQuery(...)` - update matching items across loaded pages
- `insertAtTop(...)` - prepend an item to the first loaded page
- `insertAtBottomIfLoaded(...)` - append an item only when the final page is loaded
- `insertAtPosition(...)` - insert based on the same sort key/order as the server query

When using `insertAtPosition(...)`, make sure `sortKeyFromItem` matches the server
query sort exactly. Including a stable tie-breaker such as `_creationTime` is recommended.

### Conditional queries with skipToken

Use `skipToken` to conditionally skip a query when certain conditions aren't met.

```typescript
import { Component, signal } from '@angular/core';
import { injectQuery, skipToken } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `
    @if (user.isSkipped()) {
      <p>Select a user to view profile</p>
    } @else if (user.isLoading()) {
      <p>Loading...</p>
    } @else {
      <p>{{ user.data()?.name }}</p>
    }
  `,
})
export class AppComponent {
  readonly userId = signal<string | null>(null);

  // Query is skipped when userId is null
  readonly user = injectQuery(api.users.getProfile, () => (this.userId() ? { userId: this.userId() } : skipToken));
}
```

This is useful when:

- Query arguments depend on user selection
- You need to wait for authentication before fetching data
- A parent query must complete before running a dependent query

### Using the Convex client

Use `injectConvex` to get full flexibility of the Convex client.

```typescript
import { Component } from '@angular/core';
import { injectConvex } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="completeAllTodos()">Complete All Todos</button>`,
})
export class AppComponent {
  readonly convex = injectConvex();

  async completeAllTodos() {
    try {
      await this.convex.action(api.todoFunctions.completeAllTodos, {});
    } catch (error) {
      console.error(error);
    }
  }
}
```

### Monitoring connection state

Use `injectConvexConnectionState` to react to online/offline and reconnecting changes.

```typescript
import { Component } from '@angular/core';
import { injectConvexConnectionState } from 'convex-angular';

@Component({
  selector: 'app-connection-indicator',
  template: `
    @if (!connectionState().isWebSocketConnected) {
      <p>Reconnecting to Convex...</p>
    }
  `,
})
export class ConnectionIndicatorComponent {
  readonly connectionState = injectConvexConnectionState();
}
```

### Creating helpers outside the initial injection context

If you need to create a Convex helper later from plain code, capture an
`EnvironmentInjector` in DI and pass it as `injectRef`.

```typescript
import { Component, EnvironmentInjector, inject } from '@angular/core';
import { injectMutation } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="submit()">Save</button>`,
})
export class AppComponent {
  private readonly injectRef = inject(EnvironmentInjector);

  async submit() {
    const mutation = injectMutation(api.todos.addTodo, {
      injectRef: this.injectRef,
    });

    try {
      await mutation({ title: 'Created outside the initial scope' });
    } catch (error) {
      console.error(error);
    }
  }
}
```

This works for all public `inject*` helpers, including `injectQuery`,
`injectQueries`, `injectPrewarmQuery`, `injectPaginatedQuery`,
`injectMutation`, `injectAction`, `injectConvex`,
`injectConvexConnectionState`, and `injectAuth`.
`injectConvex({ injectRef })` is also lazy, so capturing the helper does not
create the underlying browser client until first use.

## 🔐 Authentication

### Using injectAuth

Use `injectAuth` to access the authentication state in your components.

```typescript
import { Component } from '@angular/core';
import { injectAuth } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `
    @switch (auth.status()) {
      @case ('loading') {
        <p>Loading...</p>
      }
      @case ('authenticated') {
        <app-dashboard></app-dashboard>
      }
      @case ('unauthenticated') {
        <app-login></app-login>
      }
    }
  `,
})
export class AppComponent {
  readonly auth = injectAuth();
}
```

The auth state provides:

- `isLoading()` - True while the auth provider is loading or Convex is still validating the current token with the backend
- `isAuthenticated()` - True only after the auth provider reports an authenticated user and Convex confirms the token
- `error()` - The most recent unexpected provider, token, or auth-sync failure
- `status()` - `'loading' | 'authenticated' | 'unauthenticated'`

Returning `null` from `fetchAccessToken(...)` is treated as a normal
unauthenticated outcome. It does not populate `error()`.

### Clerk Integration

`provideClerkAuth()` accepts any Clerk token source that can satisfy the
`ClerkAuthProvider` contract. `sessionClaims` is optional but recommended; when
provided, it participates in reactive reauthentication tracking.

To integrate with Clerk, create a service that implements `ClerkAuthProvider`
and register it with `provideClerkAuth()`.

```typescript
// clerk-auth.service.ts
import { Injectable, Signal, computed, inject } from '@angular/core';
import { Clerk } from '@clerk/clerk-js'; // Your Clerk instance

// app.config.ts
import { CLERK_AUTH, ClerkAuthProvider, provideClerkAuth, provideConvex } from 'convex-angular';

@Injectable({ providedIn: 'root' })
export class ClerkAuthService implements ClerkAuthProvider {
  private clerk = inject(Clerk);

  readonly isLoaded = computed(() => this.clerk.loaded());
  readonly isSignedIn = computed(() => !!this.clerk.user());
  readonly orgId = computed(() => this.clerk.organization()?.id);
  readonly orgRole = computed(() => this.clerk.organization()?.membership?.role);
  readonly sessionClaims = computed(() => this.clerk.session?.claims ?? null);

  async getToken(options?: { skipCache?: boolean }) {
    return (await this.clerk.session?.getToken(options)) ?? null;
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://<your-convex-deployment>.convex.cloud'),
    { provide: CLERK_AUTH, useExisting: ClerkAuthService },
    provideClerkAuth(),
  ],
};
```

`sessionClaims` is optional in the interface. Include it when your Clerk setup
can expose reactive claims changes.

`provideClerkAuth()` already includes `provideConvexAuth()`, so do not add both.
If your Clerk service exposes upstream failures, forward them via the optional
`error` signal so `injectAuth().error()` can surface them. Clerk integrations
can also expose reactive auth context like `orgId`/`orgRole`; `provideClerkAuth()`
uses that state, plus optional `sessionClaims`, to refresh the token when auth
context changes. Return `null` only when the user is signed out or no token is
available. Let real token-fetch failures throw so `injectAuth().error()` can
surface them. If `getToken()` returns a token Convex cannot validate, the auth
attempt will fail during Convex auth sync rather than at provider setup time.

### Auth0 Integration

To integrate with Auth0, create a service that implements `Auth0AuthProvider` and register it with `provideAuth0Auth()`.

```typescript
// auth0-auth.service.ts
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@auth0/auth0-angular';
// app.config.ts
import { AUTH0_AUTH, Auth0AuthProvider, provideAuth0Auth, provideConvex } from 'convex-angular';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class Auth0AuthService implements Auth0AuthProvider {
  private auth0 = inject(AuthService);

  readonly isLoading = toSignal(this.auth0.isLoading$, { initialValue: true });
  readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, {
    initialValue: false,
  });

  async getAccessTokenSilently(options: { detailedResponse: true; cacheMode?: 'on' | 'off' }) {
    return firstValueFrom(
      this.auth0.getAccessTokenSilently({
        detailedResponse: options.detailedResponse,
        cacheMode: options.cacheMode,
      }),
    );
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://<your-convex-deployment>.convex.cloud'),
    { provide: AUTH0_AUTH, useExisting: Auth0AuthService },
    provideAuth0Auth(),
  ],
};
```

`provideAuth0Auth()` already includes `provideConvexAuth()`, so do not add both.
If your Auth0 service can expose upstream auth failures, forward them via the
optional `error` signal so `injectAuth().error()` can surface them.
`provideAuth0Auth()` now requires the detailed Auth0 token response so it can
forward `id_token` to Convex. Legacy string-only implementations of
`getAccessTokenSilently()` are no longer supported.

### Custom Auth Providers

For other auth providers, implement the `ConvexAuthProvider` interface and use
`provideConvexAuthFromExisting(...)` as the default setup.

```typescript
// custom-auth.service.ts
import { Injectable, signal } from '@angular/core';
// app.config.ts
import { CONVEX_AUTH, ConvexAuthProvider, provideConvex, provideConvexAuthFromExisting } from 'convex-angular';

@Injectable({ providedIn: 'root' })
export class CustomAuthService implements ConvexAuthProvider {
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly reauthVersion = signal(0);

  constructor() {
    // Initialize your auth provider
    myAuthProvider.onStateChange((state) => {
      this.isLoading.set(false);
      this.isAuthenticated.set(state.loggedIn);
    });

    myAuthProvider.onError?.((error) => {
      this.error.set(error);
    });

    myAuthProvider.onOrganizationChange?.(() => {
      this.reauthVersion.update((version) => version + 1);
    });
  }

  async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    return myAuthProvider.getToken({ refresh: forceRefreshToken });
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://<your-convex-deployment>.convex.cloud'),
    provideConvexAuthFromExisting(CustomAuthService),
  ],
};
```

`provideConvexAuthFromExisting(...)` registers `CONVEX_AUTH` with `useExisting` and includes `provideConvexAuth()` internally.

Optional `ConvexAuthProvider` hooks:

- `reauthVersion` - expose a signal that changes when account, tenant, or
  organization context changes require a fresh token while the user stays signed in
- `error` - expose upstream auth failures so they flow through `injectAuth().error()`

Return `null` or `undefined` from `fetchAccessToken(...)` when the user is
signed out or no token is available. That keeps auth unauthenticated without
marking it as an error.
Let unexpected token-fetch failures throw so they become `injectAuth().error()`
instead of being treated as ordinary sign-out.

If you wire `CONVEX_AUTH` manually, use `useExisting` (not `useClass`) when the
auth provider is also injected elsewhere, otherwise you can end up with two
instances and auth signal updates won’t reach Convex auth sync.

### Convex Auth (`@convex-dev/auth`)

When integrating `@convex-dev/auth`, implement `fetchAccessToken` to return the
Convex-auth JWT (return `null` when signed out).

```typescript
import { Injectable, signal } from '@angular/core';
import { ConvexAuthProvider } from 'convex-angular';

@Injectable({ providedIn: 'root' })
export class ConvexAuthService implements ConvexAuthProvider {
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);

  async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
    return myAuthProvider.getToken({ refresh: forceRefreshToken });
  }
}
```

With `provideConvexAuth()` registered, convex-angular will call
`convex.setAuth(...)` / `convex.client.clearAuth()` automatically when your
provider’s `isAuthenticated` changes. If your auth client can fail
independently, expose an optional `error` signal. If auth context can change
while the user stays signed in, expose `reauthVersion` to force a fresh token.

### Auth Directives

Use structural directives to conditionally render content based on auth state.

```html
<!-- Show only when authenticated -->
<nav *cvaAuthenticated>
  <span>Welcome back!</span>
  <button (click)="logout()">Sign Out</button>
</nav>

<!-- Show only when NOT authenticated -->
<div *cvaUnauthenticated>
  <p>Please sign in to continue.</p>
  <button (click)="login()">Sign In</button>
</div>

<!-- Show while auth is loading -->
<div *cvaAuthLoading>
  <p>Checking authentication...</p>
</div>
```

Import the directives in your component:

```typescript
import { CvaAuthLoadingDirective, CvaAuthenticatedDirective, CvaUnauthenticatedDirective } from 'convex-angular';

@Component({
  imports: [CvaAuthenticatedDirective, CvaUnauthenticatedDirective, CvaAuthLoadingDirective],
  // ...
})
export class AppComponent {}
```

### Route Guards

Protect routes that require authentication using `convexAuthGuard`.

```typescript
// app.routes.ts
import { Routes } from '@angular/router';
import { convexAuthGuard } from 'convex-angular';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [convexAuthGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [convexAuthGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
];
```

By default, unauthenticated users are redirected to `/login` with a
`returnUrl` query param preserving the blocked destination. For example,
visiting `/profile?tab=security#sessions` while signed out redirects to
`/login?returnUrl=%2Fprofile%3Ftab%3Dsecurity%23sessions`.

To customize the redirect route:

```typescript
// app.config.ts
import { CONVEX_AUTH_GUARD_CONFIG } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    {
      provide: CONVEX_AUTH_GUARD_CONFIG,
      useValue: { loginRoute: '/auth/signin' },
    },
  ],
};
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request.

### Repo development

```bash
pnpm install
pnpm dev:backend
pnpm dev:frontend
pnpm test:library
pnpm build:library
```

## ⚖️ License

[MIT](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
