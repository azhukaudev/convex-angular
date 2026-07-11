# convex-angular

[![NPM version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![GitHub license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
[![NPM downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)

The Angular client for Convex.

## 📚 Quick Links

- [✨ Features](#-features)
- [🚀 Getting Started](#-getting-started)
- [📖 Usage](#-usage)
  - [Fetching data](#fetching-data) — `injectQuery`
  - [Fetching multiple queries](#fetching-multiple-queries) — `injectQueries`
  - [Prewarming queries](#prewarming-queries) — `injectPrewarmQuery`
  - [Preloading route data](#preloading-route-data) — `convexQueryResolver`
  - [Mutating data](#mutating-data) — `injectMutation`
  - [Running actions](#running-actions) — `injectAction`
  - [Handling Convex errors](#handling-convex-errors) — `ConvexError`
  - [Paginated queries](#paginated-queries) — `injectPaginatedQuery`
  - [Optimistic paginated updates](#optimistic-paginated-updates) — `insertAtTop`, `insertAtPosition`, ...
  - [Conditional queries with skipToken](#conditional-queries-with-skiptoken)
  - [Using the Convex client](#using-the-convex-client) — `injectConvex`
  - [Monitoring connection state](#monitoring-connection-state) — `injectConvexConnectionState`
  - [Creating helpers outside the initial injection context](#creating-helpers-outside-the-initial-injection-context)
- [🔐 Authentication](#-authentication)
  - [Using injectAuth](#using-injectauth)
  - [Clerk Integration](#clerk-integration)
  - [Auth0 Integration](#auth0-integration)
  - [Better Auth Integration](#better-auth-integration)
  - [Custom Auth Providers](#custom-auth-providers)
  - [Convex Auth (@convex-dev/auth)](#convex-auth-convex-devauth)
  - [Auth Directives](#auth-directives)
  - [Route Guards](#route-guards)
  - [Reusing the initial auth token](#reusing-the-initial-auth-token) — `initialAuthTokenReuse`
- [🖥️ Server-side rendering](#️-server-side-rendering)
  - [Authenticated SSR](#authenticated-ssr)
  - [SSR behavior by helper](#ssr-behavior-by-helper)
- [🧪 Testing](#-testing)
- [🤝 Contributing](#-contributing)
- [⚖️ License](#️-license)

## ✨ Features

- 🔌 Core providers: `provideConvex`, `injectQuery`, `injectQueries`, `injectPrewarmQuery`, `injectMutation`, `injectAction`, `injectPaginatedQuery`, `injectConvex`, and `injectConvexConnectionState`
- 🔐 Authentication: Built-in support for Clerk, Auth0, Better Auth, and custom providers via `injectAuth`
- 🛡️ Route Guards: Protect routes with `convexAuthGuard`, `convexUnauthGuard`, and claims-based guards via `createConvexAuthGuard` — all usable in `canActivate` and `canMatch`
- 🧭 Route Resolvers: Preload query data before navigation with `convexQueryResolver`
- 🎯 Auth Directives: `*cvaAuthenticated`, `*cvaUnauthenticated`, `*cvaAuthLoading`, `*cvaAuthRefreshing`
- 📄 Pagination: Built-in support for paginated queries with `loadMore` and `reset`
- ⚡ Optimistic pagination helpers: `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`
- ⏭️ Conditional Queries: Use `skipToken` to conditionally skip queries
- 📡 Signal Integration: [Angular Signals](https://angular.dev/guide/signals) for reactive state
- 🖥️ Server-side rendering: zero-config Angular SSR/hydration support — queries are fetched on the server, transferred via `TransferState`, and seeded without a loading flash
- 🧹 Auto Cleanup: Automatic lifecycle management for subscriptions and helper-owned reactive state

## 🚀 Getting Started

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

`isLoading()` is true during the initial load and while resubscribing (after
an args change or `refetch()`). Use `isRefetching()` to tell the two apart:
it is true only while a previous value is still shown in `data()` during a
resubscribe, so you can render a lightweight "refreshing" affordance instead
of a full skeleton.

To avoid an empty initial state entirely, pass `placeholderData` — a value
(or a factory receiving the current args) shown in `data()` while the first
result loads. Placeholder data never marks the query successful: `status()`
stays `'pending'`, `isPlaceholderData()` is true, `onSuccess` does not fire,
and the placeholder is cleared if the query errors. A typical use is seeding
a detail view from a list item already on hand:

```typescript
readonly todo = injectQuery(api.todos.getTodo, () => ({ id: this.todoId() }), {
  // Shown instantly while the full record loads; signals read inside the
  // factory are not tracked.
  placeholderData: (args) => this.todoList.data()?.find((todo) => todo._id === args.id),
});
```

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

`prewarm(...)` returns a `Promise<boolean>` you can ignore for
fire-and-forget usage. It resolves `true` once the warm subscription receives
its first result (a later `injectQuery` for the same query and args reads the
warm cache), and `false` when the subscription fails, expires before a result
arrives, or runs during server-side rendering where prewarming is a no-op.

### Preloading route data

Use `convexQueryResolver` to block navigation until a query's first result is
available locally. By the time the routed component is created, its
`injectQuery(...)` for the same query and args reads the warm cache and renders
without a loading state.

```typescript
// app.routes.ts
import { Routes } from '@angular/router';
import { convexQueryResolver } from 'convex-angular';

import { api } from '../convex/_generated/api';

export const routes: Routes = [
  {
    path: 'users/:id',
    loadComponent: () => import('./user-profile.component').then((m) => m.UserProfileComponent),
    resolve: {
      profile: convexQueryResolver(api.users.getProfile, (route) => ({
        userId: route.paramMap.get('id')!,
      })),
    },
  },
];

// user-profile.component.ts — renders instantly from the warm cache
export class UserProfileComponent {
  private readonly route = inject(ActivatedRoute);

  readonly profile = injectQuery(api.users.getProfile, () => ({
    userId: this.route.snapshot.paramMap.get('id')!,
  }));
}
```

Resolution never blocks navigation on failure: subscription errors resolve
`undefined` and the component's own `injectQuery` surfaces the error
reactively. The resolver keeps its subscription warm for 5 seconds after
resolving (configurable via `keepSubscribedFor`) so the component's
subscription deduplicates onto it. During server-side rendering the resolver
fetches over HTTP and transfers the result to the browser, like `injectQuery`.

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
      await this.addTodo.mutate({ title: 'Buy groceries' });
    } catch (error) {
      console.error(error);
    }
  }
}
```

`mutate()` rejects on failure. `error()` and `status()` are still updated, and
`onError` still runs before the promise rejects.

`data()` is typed as `T | undefined` and stays undefined until the first
successful mutation result or after `reset()`.

If the owning Angular scope is destroyed while a mutation is in flight, the
returned promise still settles, but the helper stops updating its reactive
state and stops firing `onSuccess` / `onError`.

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
      await this.completeAllTodos.run({});
    } catch (error) {
      console.error(error);
    }
  }
}
```

`run()` rejects on failure. `error()` and `status()` are still updated, and
`onError` still runs before the promise rejects.

`data()` is typed as `T | undefined` and stays undefined until the first
successful action result or after `reset()`.

If the owning Angular scope is destroyed while an action is in flight, the
returned promise still settles, but the helper stops updating its reactive
state and stops firing `onSuccess` / `onError`.

### Handling Convex errors

Every helper's `error()` signal (and `onError` callback) is typed as `Error`,
but errors thrown by your Convex functions via `ConvexError` carry a typed
`data` payload. Narrow with `instanceof` to read it — `ConvexError` is
re-exported from `convex-angular` for convenience:

```typescript
import { ConvexError, injectMutation } from 'convex-angular';

readonly addTodo = injectMutation(api.todos.addTodo, {
  onError: (err) => {
    if (err instanceof ConvexError) {
      // Typed application error from your Convex function
      this.toast.error(err.data.message);
    } else {
      // Transport or unexpected error
      this.toast.error('Something went wrong');
    }
  },
});
```

### Paginated queries

Use `injectPaginatedQuery` for infinite scroll or "load more" patterns.
Your Convex query must accept a `paginationOpts` argument.

Note: `injectPaginatedQuery` currently relies on Convex's experimental
paginated subscription client APIs. Check `convex-angular` release notes before
upgrading `convex` to make sure your client version is still supported — this
release is tested against `convex` 1.41.x.

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
- `status()` - `'pending' | 'success' | 'error' | 'skipped'`
- `error()` - Error if the query failed
- `loadMore(n)` - Load `n` more items
- `reset()` - Reset pagination and reload from the beginning; also use this to retry first-page failures

### Optimistic paginated updates

Use the paginated optimistic helpers inside `injectMutation(..., { optimisticUpdate })`
to keep infinite lists feeling instant.

```typescript
import { Component } from '@angular/core';
import { injectMutation, insertAtTop } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="createTodo()">Add Todo</button>`,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todos.addTodo, {
    optimisticUpdate: (localStore, args) => {
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
    },
  });

  async createTodo() {
    await this.addTodo.mutate({ title: 'Buy groceries' });
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

  completeAllTodos() {
    this.convex.action(api.todoFunctions.completeAllTodos, {});
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
      await mutation.mutate({ title: 'Created outside the initial scope' });
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
      @case ('refreshing') {
        <app-dashboard></app-dashboard>
        <p>Reconnecting your session…</p>
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
- `isAuthenticated()` - True only after the auth provider reports an authenticated user and Convex confirms the token. Stays true during a refresh so the UI does not flicker to a signed-out state
- `isRefreshing()` - True when the server rejected a previously-confirmed token and Convex paused the socket while fetching a replacement. Only ever true while `isAuthenticated()` is also true; routine background token rotation does not trigger it
- `error()` - The most recent unexpected provider, token, or auth-sync failure
- `status()` - `'loading' | 'authenticated' | 'refreshing' | 'unauthenticated'`
- `getAuth()` - Snapshot of the JWT currently used by the Convex client together with its decoded claims, or undefined when no token is set. A method rather than a signal: the client emits no token-change events, so read it on demand (for example right before calling an external API that reuses the Convex token)

Use the `*cvaAuthRefreshing` directive to layer a "reconnecting" affordance on top of authenticated content:

```html
<app-dashboard *cvaAuthenticated></app-dashboard>
<div *cvaAuthRefreshing class="reconnecting-banner">Reconnecting your session…</div>
```

Returning `null` from `fetchAccessToken(...)` is treated as a normal
unauthenticated outcome. It does not populate `error()`.

### Clerk Integration

To integrate with Clerk, create a service that implements `ClerkAuthProvider` and register it with `provideClerkAuth()`.

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
  readonly sessionId = computed(() => this.clerk.session()?.id);
  readonly orgId = computed(() => this.clerk.organization()?.id);
  readonly orgRole = computed(() => this.clerk.organization()?.membership?.role);

  async getToken(options?: { template?: string; skipCache?: boolean }) {
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

`provideClerkAuth()` already includes `provideConvexAuth()`, so do not add both.
If your Clerk service exposes upstream failures, forward them via the optional
`error` signal so `injectAuth().error()` can surface them. Clerk integrations
can also expose reactive auth context like `sessionId` and `orgId`/`orgRole`;
`provideClerkAuth()` uses that state to re-run auth setup when the Clerk session
is replaced (for example after signing out and back in) or when organization
context changes. Expose `sessionId` — without it a replaced session can leave
Convex fetching tokens for the dead session, so auth looks loaded but stays
unauthenticated until the app reloads.
Return `null` only when the user is signed out or no token is available. A
failed `getToken()` call is caught by the adapter and treated as a clean
signed-out outcome, so `injectAuth().error()` will not surface it — let
unexpected errors propagate out of `getToken()` rather than swallowing them
yourself.

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

  async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }) {
    const response = await firstValueFrom(
      this.auth0.getAccessTokenSilently({ detailedResponse: true, cacheMode: options?.cacheMode }),
    );
    return response.id_token;
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

Unlike the Clerk integration, Auth0 has no automatic re-authentication when
organization context changes. If your app switches Auth0 organizations while
the user stays signed in, implement `ConvexAuthProvider` directly (see below)
and bump its `reauthVersion` signal on org changes to force a fresh token.

### Better Auth Integration

The `convex-angular/better-auth` secondary entry point provides built-in
session tracking and Convex token exchange for [Better Auth](https://www.better-auth.com/),
with **no dependency on better-auth packages**: the library types your client
structurally (`BetterAuthClientLike`), so you own the `better-auth` /
`@convex-dev/better-auth` versions and their upgrades never break this
integration.

```typescript
// auth-client.ts — one shared client instance for flows and the library
import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';

import { environment } from './environments/environment';

export const authClient = createAuthClient({
  baseURL: environment.convexSiteUrl,
  plugins: [convexClient(), crossDomainClient()],
});
```

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';
import { provideBetterAuth } from 'convex-angular/better-auth';

import { authClient } from './auth-client';
import { environment } from './environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex(environment.convexUrl), provideBetterAuth(() => authClient)],
};
```

`provideBetterAuth(...)` already includes `provideConvexAuth()`, so do not add
it separately. Session state and the Convex token exchange (caching, inflight
dedup, `forceRefreshToken` bypass, invalidation when the session id changes)
are handled for you; read them with `injectBetterAuth()`:

```typescript
import { Component } from '@angular/core';
import { injectBetterAuth } from 'convex-angular/better-auth';

@Component({
  selector: 'app-account',
  template: `
    @if (betterAuth.isAuthenticated()) {
      <p>Signed in as {{ betterAuth.session()?.user?.['email'] }}</p>
    }
  `,
})
export class AccountComponent {
  readonly betterAuth = injectBetterAuth();
}
```

Sign-in/up/out flows stay on your own client instance (`authClient` above) —
`provideBetterAuth()` exposes no wrappers for them. After a flow completes,
resync the session:

```typescript
await authClient.signIn.email({ email, password });
await this.betterAuth.refreshSession();

// after signOut:
await authClient.signOut();
this.betterAuth.clearSession();
```

Better Auth is browser-only in this integration: on the server platform
`injectBetterAuth()` reports `isLoading: false` and unauthenticated, and never
constructs your client. For authenticated server-side rendering, see
[Authenticated SSR with Better Auth](#authenticated-ssr-with-better-auth) below.

#### Authenticated SSR with Better Auth

**Same-origin deployments only**: this recipe requires Better Auth's handler to
be reachable on the app's own origin, so the session cookie rides the initial
navigation request. If your client uses `crossDomainClient()`/`crossDomain()`
(the cross-domain setup), the session lives in browser `localStorage`, which
the server cannot see — authenticated SSR is not possible in that topology
today, and the render is unauthenticated until the client hydrates and
authenticates.

For same-origin deployments, use `getToken` from `@convex-dev/better-auth/utils`
inside the `ssr.authToken` factory:

```typescript
// app.config.server.ts — same-origin Better Auth deployments only
import { REQUEST, inject } from '@angular/core';
import { getToken } from '@convex-dev/better-auth/utils';
import { provideConvex } from 'convex-angular';

export const serverConfig: ApplicationConfig = {
  providers: [
    provideConvex(environment.convexUrl, {
      ssr: {
        authToken: async () => {
          const request = inject(REQUEST); // must be the first statement — the injection context does not survive an await
          if (!request) return null;

          const headers = new Headers(request.headers); // copy: getToken mutates it
          const { token } = await getToken(environment.convexSiteUrl, headers);
          return token ?? null;
        },
      },
    }),
  ],
};
```

`getToken` makes one blocking HTTP round trip to `${convexSiteUrl}/api/auth/convex/token`
per server render — memoized per render, but it still gates every SSR query
fetch, so budget for that latency. Mitigate it with `getToken`'s `jwtCache`
option, backed by a same-origin `convex_jwt` cookie.
`@convex-dev/better-auth/utils` is a dependency your app already has for its
Better Auth setup; `convex-angular` itself needs nothing new for this.

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

<!-- Show while a rejected token is being refreshed (user stays authenticated) -->
<div *cvaAuthRefreshing>
  <p>Reconnecting your session...</p>
</div>

<!-- Show while auth is loading -->
<div *cvaAuthLoading>
  <p>Checking authentication...</p>
</div>
```

Import the directives in your component:

```typescript
import {
  CvaAuthLoadingDirective,
  CvaAuthRefreshingDirective,
  CvaAuthenticatedDirective,
  CvaUnauthenticatedDirective,
} from 'convex-angular';

@Component({
  imports: [
    CvaAuthenticatedDirective,
    CvaUnauthenticatedDirective,
    CvaAuthLoadingDirective,
    CvaAuthRefreshingDirective,
  ],
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
`/login?returnUrl=%2Fprofile%3Ftab%3Dsecurity%23sessions`. Users whose
rejected token is being refreshed (`injectAuth().isRefreshing()`) are still
treated as authenticated and pass the guard.

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

All guards work in both `canActivate` and `canMatch`. Prefer `canMatch` for
lazy-loaded routes: a failed `canMatch` prevents the route from matching at
all, so the protected bundle is never downloaded for unauthenticated users.

```typescript
{
  path: 'dashboard',
  loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  canMatch: [convexAuthGuard],
},
```

Use `convexUnauthGuard` for routes that only make sense signed out (login,
registration). Authenticated users are redirected to `authenticatedRoute`
from `CONVEX_AUTH_GUARD_CONFIG` (default `/`):

```typescript
{
  path: 'login',
  loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  canActivate: [convexUnauthGuard],
},
```

For role- or claim-gated routes, create a guard with `createConvexAuthGuard`.
After authentication is confirmed, the `allow` callback receives the current
JWT and its decoded claims (from `injectAuth().getAuth()`); while a rejected
token is being refreshed the guard waits for the refresh to settle so the
claims are never stale. Authenticated users who fail the check are sent to
`forbiddenRoute`, or blocked when it is omitted:

```typescript
import { createConvexAuthGuard } from 'convex-angular';

const adminGuard = createConvexAuthGuard({
  allow: ({ claims }) => claims['role'] === 'admin',
  forbiddenRoute: '/forbidden',
});

export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent),
    canMatch: [adminGuard],
  },
];
```

### Reusing the initial auth token

By default the Convex client sends its cached auth token to the server and then
immediately fetches a fresh one. That second token triggers another
`Authenticate` message, which makes the server re-execute every authenticated
query on startup. The `initialAuthTokenReuse` client option keeps the cached
token instead (a refresh is scheduled before it expires), so authenticated apps
skip that duplicate re-execution and load faster:

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://<your-convex-deployment>.convex.cloud', {
      initialAuthTokenReuse: true,
    }),
  ],
};
```

> The option is marked experimental upstream and may change in a future Convex
> release.

## 🖥️ Server-side rendering

`convex-angular` works out of the box with Angular SSR (`@angular/ssr`) and hydration.
No extra configuration is required — when the app renders on the server:

- The WebSocket client is automatically disabled (no socket is opened on the server).
- `injectQuery` and `injectQueries` fetch their data once over HTTP during the server
  render, so the generated HTML contains real content. Angular's SSR serialization
  waits for these fetches.
- Results are transferred to the browser via `TransferState` and seeded into the same
  helpers after hydration, so the page renders instantly with the server's data — no
  loading flash — and the live WebSocket subscription takes over from there.

```typescript
// app.config.ts
import { provideClientHydration } from '@angular/platform-browser';
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(), // recommended for SSR apps
    provideConvex(environment.convexUrl),
  ],
};
```

### Authenticated SSR

Using Better Auth? See [Authenticated SSR with Better Auth](#authenticated-ssr-with-better-auth) for the same-origin recipe.

To fetch user-specific data during the server render, provide an `ssr.authToken`
factory that returns a JWT (for example, read from the request cookies):

```typescript
// app.config.server.ts
import { REQUEST } from '@angular/core';
import { provideConvex } from 'convex-angular';

export const serverConfig: ApplicationConfig = {
  providers: [
    provideConvex(environment.convexUrl, {
      ssr: {
        authToken: () => {
          const request = inject(REQUEST);
          return readSessionTokenFromCookies(request); // your cookie parsing
        },
      },
    }),
  ],
};
```

The token factory is resolved once per server render. Returning `null` or `undefined`
fetches unauthenticated. To disable server-side fetching entirely (helpers stay
`pending` in the server HTML and load live after hydration), pass
`ssr: { fetchOnServer: false }`.

> **Cache safety**: authenticated results are embedded in the rendered HTML via
> `TransferState`, along with everything else on the page. If that response is ever
> stored in a shared cache (a CDN, a reverse proxy, a misconfigured `Cache-Control`),
> one user's private data can be served to another. Any response produced while
> `ssr.authToken` resolves a token **must** be served with `Cache-Control: private`
> (or `no-store`).
>
> If you cannot guarantee that, set `ssr: { transferAuthenticatedResults: false }`.
> The server still renders authenticated data into the HTML for that request, but it
> is not duplicated into the transfer blob — the hydrated client re-fetches the data
> live instead of seeding from `TransferState`, trading a brief post-hydration loading
> state for keeping private data out of the transfer payload. The flag has no effect
> on unauthenticated fetches (no `authToken` configured, or the factory resolves
> `null`/`undefined`), which always transfer normally.

### SSR behavior by helper

| Helper                            | On the server                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `injectQuery` / `injectQueries`   | Fetch over HTTP, render data, transfer to the browser                                                                                  |
| `injectPaginatedQuery`            | Fetches the first page over HTTP, renders and transfers it; `loadMore` becomes active once the live subscription syncs after hydration |
| `convexQueryResolver`             | Fetches over HTTP (blocking the render) and transfers to the browser                                                                   |
| `injectPrewarmQuery`              | `prewarm()` is a no-op                                                                                                                 |
| `injectConvexConnectionState`     | Reports a static disconnected state                                                                                                    |
| `injectAuth`                      | Reports the provider's state; Convex token sync resumes in the browser                                                                 |
| `injectMutation` / `injectAction` | Calling them during SSR throws (mutations/actions are user interactions)                                                               |

> Design note: convex-angular intentionally exposes no `QueryJournal` API. The
> journal's purpose in `convex/react` (resuming a server-started subscription in
> the browser) is covered here by the `TransferState` handoff, and the underlying
> `ConvexClient` does not accept journals on its subscription API.

## 🧪 Testing

Unit-test components that use convex-angular helpers without a real Convex
deployment via the `convex-angular/testing` entry point. `MockConvexClient`
captures every subscription and invocation the helpers make so the test can
drive them: emit query results, settle mutations, change connection state, or
pre-seed the warm cache.

```typescript
import { TestBed } from '@angular/core/testing';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

describe('TodoListComponent', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex)],
    });
  });

  it('renders todos from the query', () => {
    const fixture = TestBed.createComponent(TodoListComponent);
    fixture.detectChanges();

    // Drive the injectQuery subscription like the live WebSocket would.
    convex.lastQuerySubscription()!.emit([{ _id: '1', title: 'Buy groceries' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Buy groceries');
  });

  it('saves new todos', async () => {
    const fixture = TestBed.createComponent(TodoListComponent);
    fixture.detectChanges();

    fixture.componentInstance.add('New todo');
    expect(convex.mutationCalls[0].args).toEqual({ title: 'New todo' });

    // Settle the captured mutation to drive status/data signals.
    convex.mutationCalls[0].resolve('todo-id');
  });
});
```

`new MockConvexClient({ disabled: true })` mirrors the server-side rendering
client (no subscriptions, throwing `client` getter) for SSR-behavior tests.

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
