# convex-angular

[![NPM version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![GitHub license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
[![NPM downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)

The Angular client for Convex.

## ✨ Features

- 🔌 Core providers: `provideConvex`, `injectQuery`, `injectMutation`, `injectAction`, `injectPaginatedQuery`, and `injectConvex`
- 🔐 Authentication: Built-in support for Clerk, Auth0, and custom auth providers via `injectAuth`
- 🛡️ Route Guards: Protect routes with `convexAuthGuard`
- 🎯 Auth Directives: `*cvaAuthenticated`, `*cvaUnauthenticated`, `*cvaAuthLoading`
- 📄 Pagination: Built-in support for paginated queries with `loadMore` and `reset`
- ⏭️ Conditional Queries: Use `skipToken` to conditionally skip queries
- 📡 Signal Integration: [Angular Signals](https://angular.dev/guide/signals) for reactive state
- 🧹 Auto Cleanup: Automatic lifecycle management

## 🚀 Getting Started

> Requirements: Angular >= 20, Convex >= 1.31, RxJS >= 7.8.

1. Install the dependencies:

```bash
npm install convex convex-angular
```

2. Add `provideConvex` to your `app.config.ts` file:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex('https://<your-convex-deployment>.convex.cloud')],
};
```

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

### Mutating data

Use `injectMutation` to mutate the database.

```typescript
import { Component } from '@angular/core';
import { injectMutation } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `
    <button (click)="addTodo.mutate({ title: 'Buy groceries' })">
      Add Todo
    </button>
  `,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todos.addTodo);
}
```

### Running actions

Use `injectAction` to run actions.

```typescript
import { Component } from '@angular/core';
import { injectAction } from 'convex-angular';

import { api } from '../convex/_generated/api';

@Component({
  selector: 'app-root',
  template: `<button (click)="completeAllTodos.run({})">
    Complete All Todos
  </button>`,
})
export class AppComponent {
  readonly completeAllTodos = injectAction(api.todoFunctions.completeAllTodos);
}
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
  readonly todos = injectPaginatedQuery(
    api.todos.listTodosPaginated,
    () => ({}),
    () => ({ initialNumItems: 10 }),
  );
}
```

The paginated query returns:

- `results()` - Accumulated results from all loaded pages
- `isLoadingFirstPage()` - True when loading the first page
- `isLoadingMore()` - True when loading additional pages
- `canLoadMore()` - True when more items are available
- `isExhausted()` - True when all items have been loaded
- `isSkipped()` - True when the query is skipped via `skipToken`
- `isSuccess()` - True when the first page has loaded successfully
- `status()` - `'pending' | 'success' | 'error' | 'skipped'`
- `error()` - Error if the query failed
- `loadMore(n)` - Load `n` more items
- `reset()` - Reset pagination and reload from the beginning

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
  readonly user = injectQuery(api.users.getProfile, () =>
    this.userId() ? { userId: this.userId() } : skipToken,
  );
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

- `isLoading()` - True while auth is initializing
- `isAuthenticated()` - True when user is authenticated
- `error()` - Authentication error, if any
- `status()` - `'loading' | 'authenticated' | 'unauthenticated'`

### Clerk Integration

To integrate with Clerk, create a service that implements `ClerkAuthProvider` and register it with `provideClerkAuth()`.

```typescript
// clerk-auth.service.ts
import { Injectable, Signal, computed, inject } from '@angular/core';
import { Clerk } from '@clerk/clerk-js'; // Your Clerk instance

// app.config.ts
import {
  CLERK_AUTH,
  ClerkAuthProvider,
  provideClerkAuth,
  provideConvex,
} from 'convex-angular';

@Injectable({ providedIn: 'root' })
export class ClerkAuthService implements ClerkAuthProvider {
  private clerk = inject(Clerk);

  readonly isLoaded = computed(() => this.clerk.loaded());
  readonly isSignedIn = computed(() => !!this.clerk.user());
  readonly orgId = computed(() => this.clerk.organization()?.id);
  readonly orgRole = computed(
    () => this.clerk.organization()?.membership?.role,
  );

  async getToken(options?: { template?: string; skipCache?: boolean }) {
    try {
      return (await this.clerk.session?.getToken(options)) ?? null;
    } catch {
      return null;
    }
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

### Auth0 Integration

To integrate with Auth0, create a service that implements `Auth0AuthProvider` and register it with `provideAuth0Auth()`.

```typescript
// auth0-auth.service.ts
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@auth0/auth0-angular';
// app.config.ts
import {
  AUTH0_AUTH,
  Auth0AuthProvider,
  provideAuth0Auth,
  provideConvex,
} from 'convex-angular';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class Auth0AuthService implements Auth0AuthProvider {
  private auth0 = inject(AuthService);

  readonly isLoading = toSignal(this.auth0.isLoading$, { initialValue: true });
  readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, {
    initialValue: false,
  });

  async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }) {
    return firstValueFrom(
      this.auth0.getAccessTokenSilently({ cacheMode: options?.cacheMode }),
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

### Custom Auth Providers

For other auth providers, implement the `ConvexAuthProvider` interface and use `provideConvexAuth()`.

```typescript
// custom-auth.service.ts
import { Injectable, signal } from '@angular/core';
// app.config.ts
import {
  CONVEX_AUTH,
  ConvexAuthProvider,
  provideConvex,
  provideConvexAuthFromExisting,
} from 'convex-angular';

@Injectable({ providedIn: 'root' })
export class CustomAuthService implements ConvexAuthProvider {
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);

  constructor() {
    // Initialize your auth provider
    myAuthProvider.onStateChange((state) => {
      this.isLoading.set(false);
      this.isAuthenticated.set(state.loggedIn);
    });
  }

  async fetchAccessToken({
    forceRefreshToken,
  }: {
    forceRefreshToken: boolean;
  }) {
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

  async fetchAccessToken({
    forceRefreshToken,
  }: {
    forceRefreshToken: boolean;
  }) {
    return myAuthProvider.getToken({ refresh: forceRefreshToken });
  }
}
```

With `provideConvexAuth()` registered, convex-angular will call
`convex.setAuth(...)` / `convex.client.clearAuth()` automatically when your
provider’s `isAuthenticated` changes.

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
import {
  CvaAuthLoadingDirective,
  CvaAuthenticatedDirective,
  CvaUnauthenticatedDirective,
} from 'convex-angular';

@Component({
  imports: [
    CvaAuthenticatedDirective,
    CvaUnauthenticatedDirective,
    CvaAuthLoadingDirective,
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
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    canActivate: [convexAuthGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [convexAuthGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
  },
];
```

By default, unauthenticated users are redirected to `/login`. To customize the redirect route:

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
