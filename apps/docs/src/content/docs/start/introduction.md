---
title: Introduction
description: What convex-angular is, what it gives you, and the shape of its public API.
sidebar:
  order: 1
---

`convex-angular` is the Angular client for [Convex](https://www.convex.dev/). It wraps the official
`ConvexClient` in Angular's dependency injection and exposes every result as a readonly Signal, so a
live query is an ordinary reactive value your templates can read.

```typescript
readonly todos = injectQuery(api.todos.list, () => ({}));
readonly addTodo = injectMutation(api.todos.create);
```

## What Convex is

Convex is a reactive backend platform: you write your database schema and your server functions
(queries, mutations, and actions) in TypeScript, deploy them, and Convex generates fully typed
function references for the client. Queries are not one-shot fetches — the client holds a live
subscription over a WebSocket, and any mutation that changes the underlying data pushes a new result
to every subscriber. `convex-angular` is the layer that turns those pushes into Signal updates and
ties the subscriptions to Angular's injector lifecycle.

## What you get

- Signal-first query, mutation, action, pagination, auth, and connection state.
- Argument and return types fully inferred from your generated Convex function references.
- Reactive arguments: any Signal read inside a query's argument function resubscribes the query when
  it changes, and `skipToken` skips the subscription entirely without losing type safety.
- Automatic cleanup — every helper registers its teardown on the owning scope's `DestroyRef`, and
  guards stale asynchronous work so a slow response can never overwrite a newer one.
- Angular SSR and hydration through `TransferState`: queries fetch over HTTP during the server render
  and the result is transferred to the browser, so the hydrated app renders without a loading flash.
- Built-in Clerk, Auth0, and Better Auth integration points, plus router guards and structural
  directives for authenticated UI.
- A public testing entry point with a `MockConvexClient` for driving Convex behavior without a
  backend.

The library ships standalone `inject*` helpers and `provide*` environment providers. There are no
NgModules.

## Requirements

| Package                                               | Version     |
| ----------------------------------------------------- | ----------- |
| `@angular/core`, `@angular/common`, `@angular/router` | `>=21.2.17` |
| `convex`                                              | `>=1.42.1`  |
| `rxjs`                                                | `>=7.8.0`   |

These are peer dependencies, so your application controls the versions.

## API at a glance

| API                             | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `provideConvex()`               | Register the Convex client. See [Providers](/concepts/providers/).       |
| `CONVEX`                        | Injection token holding the `ConvexClient` instance.                     |
| `injectConvex()`                | Access the provided `ConvexClient` directly for advanced use.            |
| `injectQuery()`                 | Subscribe to one reactive query.                                         |
| `injectQueries()`               | Manage a dynamic, keyed group of queries.                                |
| `injectPaginatedQuery()`        | Fetch a paginated query and load more pages.                             |
| `injectPrewarmQuery()`          | Warm a query's local cache before navigation or UI reveal.               |
| `injectMutation()`              | Run mutations with reactive state and optimistic updates.                |
| `injectAction()`                | Run actions with reactive state.                                         |
| `injectConvexConnectionState()` | Observe WebSocket connectivity and in-flight request state.              |
| `injectAuth()`                  | Read Convex authentication state.                                        |
| `provideConvexAuth()`           | Register a Convex auth provider (included by the integration providers). |
| `provideClerkAuth()`            | Wire Clerk as the Convex auth provider.                                  |
| `provideAuth0Auth()`            | Wire Auth0 as the Convex auth provider.                                  |
| `convexAuthGuard`               | Router guard admitting only authenticated users.                         |
| `convexUnauthGuard`             | Router guard admitting only unauthenticated users.                       |
| `createConvexAuthGuard()`       | Build a configured variant of the authentication guard.                  |
| `convexQueryResolver()`         | Resolve a route once its first query result is available.                |
| `skipToken`                     | Skip a query subscription without losing type safety.                    |
| `ConvexError`                   | Re-export of Convex's typed application error, for narrowing `error()`.  |

Reactive helpers expose readonly Signals only. Query-like helpers expose `data()`, `error()`,
`status()`, and focused state Signals; mutations and actions expose `mutate()` or `run()` plus
`data()`, `error()`, `isLoading()`, `isSuccess()`, `status()`, and `reset()`.

## Next

Continue to [Installation](/start/installation/) to add the package and register the client, then
build your first feature in the [Quick start](/start/quick-start/).
