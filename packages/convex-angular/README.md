# convex-angular

[![npm version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![npm downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)
[![license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)

The Angular client for [Convex](https://www.convex.dev/). Build real-time Angular applications with Signals, dependency injection, automatic subscription cleanup, authentication, pagination, and server-side rendering.

```typescript
readonly todos = injectQuery(api.todos.list, () => ({}));
readonly addTodo = injectMutation(api.todos.create);
```

## Why convex-angular?

- Signal-first query, mutation, action, pagination, auth, and connection state.
- Fully inferred types from generated Convex function references.
- Reactive arguments and `skipToken` for conditional subscriptions.
- Automatic cleanup when the owning Angular scope is destroyed.
- Angular SSR and hydration through `TransferState`.
- Built-in Clerk, Auth0, and Better Auth integration points.
- A public testing package for driving Convex behavior without a backend.

## Requirements

- Angular `>=21.2.17`
- Convex `>=1.42.1`
- RxJS `>=7.8.0`

## Quick start

Install Convex and convex-angular:

```bash
pnpm add convex convex-angular
# or: npm install convex convex-angular
```

Register one Convex client in your root application providers:

```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex('https://<your-deployment>.convex.cloud')],
};
```

`provideConvex()` must be registered exactly once at the application root. Do not repeat it in route or component providers.

Use generated Convex function references directly in a component:

```typescript
import { Component } from '@angular/core';
import { injectMutation, injectQuery } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-todos',
  template: `
    @switch (todos.status()) {
      @case ('pending') {
        <p>Loading…</p>
      }
      @case ('error') {
        <p>{{ todos.error()?.message }}</p>
      }
      @case ('success') {
        @for (todo of todos.data() ?? []; track todo._id) {
          <p>{{ todo.title }}</p>
        }
      }
    }

    <button (click)="add()" [disabled]="createTodo.isLoading()">Add todo</button>
  `,
})
export class TodoListComponent {
  readonly todos = injectQuery(api.todos.list, () => ({}));
  readonly createTodo = injectMutation(api.todos.create);

  async add() {
    await this.createTodo.mutate({ title: 'Buy groceries' });
  }
}
```

Query arguments are reactive: any Signal read by the argument function automatically resubscribes the query when it changes.

## API at a glance

| API                             | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `provideConvex()`               | Register the Convex client once at the application root.   |
| `injectQuery()`                 | Subscribe to one reactive query.                           |
| `injectQueries()`               | Manage a dynamic keyed group of queries.                   |
| `injectPaginatedQuery()`        | Fetch a paginated query and load more results.             |
| `injectPrewarmQuery()`          | Warm a query before navigation or UI reveal.               |
| `convexQueryResolver()`         | Resolve a route after its first query result is available. |
| `injectMutation()`              | Run mutations with reactive state and optimistic updates.  |
| `injectAction()`                | Run actions with reactive state.                           |
| `injectConvex()`                | Access the provided `ConvexClient`.                        |
| `injectConvexConnectionState()` | Observe WebSocket and in-flight request state.             |
| `injectAuth()`                  | Read Convex authentication state.                          |
| `skipToken`                     | Skip a query without losing type safety.                   |

Reactive helpers expose readonly Signals and clean up their own subscriptions. Query-like helpers expose `data()`, `error()`, `status()`, and focused state Signals. Mutations and actions expose `mutate()` or `run()` plus `data()`, `error()`, `isLoading()`, `isSuccess()`, `status()`, and `reset()`.

## Common patterns

### Conditional queries

Return `skipToken` until the required input exists:

```typescript
import { injectQuery, skipToken } from 'convex-angular';

readonly user = injectQuery(
  api.users.get,
  () => this.userId() ? { id: this.userId()! } : skipToken,
);
```

The query reports a `'skipped'` status and opens no subscription.

### Multiple queries

Use `injectQueries()` for a reactive keyed collection:

```typescript
readonly dashboard = injectQueries(() => ({
  user: this.userId() ? { query: api.users.get, args: { id: this.userId()! } } : skipToken,
  todos: { query: api.todos.list, args: {} },
}));
```

Read keyed values from `results()`, `errors()`, and `statuses()`. Keys removed from the definition are removed from all three records.

### Pagination

```typescript
readonly todos = injectPaginatedQuery(
  api.todos.listPaginated,
  () => ({ category: this.category() }),
  { initialNumItems: 20 },
);
```

Use `results()`, `loadMore(count)`, `canLoadMore()`, `isLoadingMore()`, and `reset()`. Paginated optimistic updates are available through `optimisticallyUpdateValueInPaginatedQuery()`, `insertAtTop()`, `insertAtBottomIfLoaded()`, `insertAtPosition()`, and `sortByField()`.

### Prewarming and route loading

`injectPrewarmQuery()` starts a short-lived background subscription so a later query can read warm local data:

```typescript
readonly prewarmProfile = injectPrewarmQuery(api.users.get);

openProfile(id: string) {
  void this.prewarmProfile.prewarm({ id });
  void this.router.navigate(['/users', id]);
}
```

Use `convexQueryResolver()` when navigation should wait for that first result instead:

```typescript
export const routes: Routes = [
  {
    path: 'users/:id',
    loadComponent: () => import('./user-profile').then((m) => m.UserProfileComponent),
    resolve: {
      profile: convexQueryResolver(api.users.get, (route) => ({
        id: route.paramMap.get('id')!,
      })),
    },
  },
];
```

Resolver failures do not cancel navigation; the component's query exposes the error reactively.

### Convex errors

Convex function errors flow through each helper's `error()` Signal and rejected mutation/action promises. Narrow application errors with the re-exported `ConvexError`:

```typescript
import { ConvexError } from 'convex-angular';

try {
  await this.createTodo.mutate({ title });
} catch (error) {
  if (error instanceof ConvexError) {
    console.error(error.data);
  }
}
```

## Authentication

`injectAuth()` reports `'loading'`, `'authenticated'`, `'refreshing'`, or `'unauthenticated'`. Authentication becomes active only after both the external provider and the Convex backend confirm the token.

```typescript
readonly auth = injectAuth();
```

| Integration | Registration                                                                               |
| ----------- | ------------------------------------------------------------------------------------------ |
| Clerk       | Provide `CLERK_AUTH` with an existing `ClerkAuthProvider`, then call `provideClerkAuth()`. |
| Auth0       | Provide `AUTH0_AUTH` with an existing `Auth0AuthProvider`, then call `provideAuth0Auth()`. |
| Better Auth | Call `provideBetterAuth()` from `convex-angular/better-auth`.                              |
| Custom      | Implement `ConvexAuthProvider` and call `provideConvexAuthFromExisting()`.                 |

These integration helpers already include `provideConvexAuth()`; do not register it separately. When manually aliasing a provider, use `useExisting` rather than `useClass` so Angular does not create a second auth-service instance.

### Better Auth

The `convex-angular/better-auth` entry point is structurally typed and adds no Better Auth package dependency. Create and own one Better Auth client, then give it to the provider:

```typescript
// app.config.ts
import { provideConvex } from 'convex-angular';
import { provideBetterAuth } from 'convex-angular/better-auth';

import { authClient } from './auth-client';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex(environment.convexUrl), provideBetterAuth(() => authClient)],
};
```

Use `injectBetterAuth()` for session state and refresh/clear operations. Sign-in, sign-up, and sign-out remain on your own client instance.

### Directives and route guards

Four standalone structural directives cover common auth UI states:

```html
<app-dashboard *cvaAuthenticated></app-dashboard>
<app-login *cvaUnauthenticated></app-login>
<app-spinner *cvaAuthLoading></app-spinner>
<p *cvaAuthRefreshing>Reconnecting…</p>
```

Protect lazy routes with `canMatch` so unauthenticated users do not download the protected bundle:

```typescript
export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard').then((m) => m.DashboardComponent),
    canMatch: [convexAuthGuard],
  },
];
```

Use `convexUnauthGuard` for signed-out-only pages and `createConvexAuthGuard()` for claim-based authorization.

## Server-side rendering

Angular SSR works without extra Convex configuration. On the server, query helpers fetch over HTTP; Angular waits for them, renders the results, and transfers the data to the browser. After hydration, live subscriptions take over without a loading flash.

```typescript
export const appConfig: ApplicationConfig = {
  providers: [provideClientHydration(), provideConvex(environment.convexUrl)],
};
```

Useful options:

```typescript
provideConvex(environment.convexUrl, {
  ssr: {
    fetchOnServer: true,
    authToken: () => readTokenFromRequest(),
    transferAuthenticatedResults: true,
  },
});
```

- Set `fetchOnServer: false` to load queries only after hydration.
- Return a JWT from `authToken` to render authenticated queries.
- Set `transferAuthenticatedResults: false` to keep authenticated results out of the `TransferState` payload.

Authenticated HTML is private data. If `authToken` returns a token, serve the response with `Cache-Control: private` or `no-store`; never place it in a shared cache.

Mutations and actions are user interactions and throw if invoked during server rendering. Prewarming is a server-side no-op.

## Testing

Use the `convex-angular/testing` entry point to test Angular code without a live deployment:

```typescript
import { TestBed } from '@angular/core/testing';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

const convex = new MockConvexClient();

TestBed.configureTestingModule({
  providers: [provideConvexTesting(convex)],
});

const fixture = TestBed.createComponent(TodoListComponent);
fixture.detectChanges();

convex.lastQuerySubscription()!.emit([{ _id: 'todo-1', title: 'Buy groceries' }]);
fixture.detectChanges();
```

`MockConvexClient` can emit query pages and errors, settle captured mutations/actions, update connection state, seed warm query results, and emulate a disabled SSR client.

## Outside an injection context

Every public `inject*` helper accepts an optional `injectRef`. Pass an `EnvironmentInjector` when creating a helper outside the initial Angular injection context:

```typescript
const mutation = injectMutation(api.todos.create, {
  injectRef: this.environmentInjector,
});
```

Prefer creating helpers during normal field initialization when possible.

## Repository development

```bash
pnpm install
pnpm dev:backend     # Convex backend
pnpm dev:frontend    # Angular demo
pnpm test:library
pnpm build:library
```

Before opening a pull request:

- Run a targeted Jest test and `pnpm verify:quick` for localized changes.
- Run `pnpm verify:full` for broad, configuration, dependency, or public-API changes. The full gate includes mutation testing and takes several minutes.
- Run `pnpm typecheck:spec` after changing specs.

See the [repository guide](https://github.com/azhukaudev/convex-angular/blob/main/AGENTS.md) for conventions and the [changelog](https://github.com/azhukaudev/convex-angular/blob/main/CHANGELOG.md) for release history.

## License

[MIT](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
