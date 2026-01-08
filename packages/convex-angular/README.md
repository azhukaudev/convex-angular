# convex-angular

[![NPM version](https://img.shields.io/npm/v/convex-angular?color=limegreen&label=npm)](https://www.npmjs.com/package/convex-angular)
[![GitHub license](https://img.shields.io/badge/license-MIT-limegreen.svg)](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
[![NPM downloads](https://img.shields.io/npm/dm/convex-angular?color=limegreen&label=downloads)](https://www.npmjs.com/package/convex-angular)

The Angular client for Convex.

## ✨ Features

- 🔌 Core providers: `injectQuery`, `injectMutation`, `injectAction`, `injectPaginatedQuery`, and `injectConvex`
- 📄 Pagination: Built-in support for paginated queries with `loadMore` and `reset`
- ⏭️ Conditional Queries: Use `skipToken` to conditionally skip queries
- 📡 Signal Integration: [Angular Signals](https://angular.dev/guide/signals) for reactive state
- 🛡️ Error Handling: Built-in error states and loading
- 🧹 Auto Cleanup: Automatic lifecycle management

## 🚀 Getting Started

1. Install the dependencies:

```bash
npm install convex convex-angular
```

2. Add `provideConvex` to your `app.config.ts` file:

```typescript
import { provideConvex } from 'convex-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideConvex('https://<your-convex-deployment>.convex.cloud')],
};
```

3. 🎉 That's it! You can now use the injection providers in your app.

## 📖 Usage

### Fetching data

Use `injectQuery` to fetch data from the database.

```typescript
import { injectQuery } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `
    <ul>
      @for (todo of todos.data(); track todo._id) {
        <li>{{ todo.name }}</li>
      }
    </ul>
  `,
})
export class AppComponent {
  readonly todos = injectQuery(api.todo.listTodos, () => ({}));
}
```

### Mutating data

Use `injectMutation` to mutate the database.

```typescript
import { injectMutation } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `
    <button (click)="addTodo.mutate({ id: '1', name: 'Buy groceries' })">
      Add Todo
    </button>
  `,
})
export class AppComponent {
  readonly addTodo = injectMutation(api.todo.addTodo);
}
```

### Running actions

Use `injectAction` to run actions.

```typescript
import { injectAction } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `<button (click)="resetTodos.run({})">Reset Todos</button>`,
})
export class AppComponent {
  readonly resetTodos = injectAction(api.todoFunctions.resetTodos);
}
```

### Paginated queries

Use `injectPaginatedQuery` for infinite scroll or "load more" patterns.

```typescript
import { injectPaginatedQuery } from 'convex-angular';

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
- `error()` - Error if the query failed
- `loadMore(n)` - Load `n` more items
- `reset()` - Reset pagination and reload from the beginning

### Conditional queries with skipToken

Use `skipToken` to conditionally skip a query when certain conditions aren't met.

```typescript
import { signal } from '@angular/core';
import { injectQuery, skipToken } from 'convex-angular';

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
import { injectConvex } from 'convex-angular';

@Component({
  selector: 'app-root',
  template: `<button (click)="completeAllTodos()">Complete All Todos</button>`,
})
export class AppComponent {
  readonly convex = injectConvex();

  completeAllTodos() {
    this.convex.mutation(api.todoFunctions.completeAllTodos, {});
  }
}
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## ⚖️ License

[MIT](https://github.com/azhukaudev/convex-angular/blob/main/LICENSE)
