import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  selector: 'cva-landing',
  templateUrl: 'landing.html',
  styleUrl: 'landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class Landing {
  readonly features = [
    {
      name: 'injectQuery',
      description: 'Reactive data fetching with Angular Signals',
      code: `readonly todos = injectQuery(
  api.todos.listTodos,
  () => ({ count: 10 })
);

// In template:
// todos.data() - the data
// todos.isLoading() - loading state
// todos.error() - error state`,
    },
    {
      name: 'injectMutation',
      description: 'Mutate data with callbacks and optimistic updates',
      code: `readonly addTodo = injectMutation(
  api.todos.addTodo,
  {
    onSuccess: () => console.log('Added!'),
    onError: (err) => console.error(err),
  }
);

async saveTodo() {
  try {
    await this.addTodo.mutate({ title: 'New task' });
  } catch (error) {
    console.error(error);
  }
}`,
    },
    {
      name: 'injectAction',
      description: 'Run server-side actions',
      code: `readonly sendEmail = injectAction(
  api.emails.send,
  {
    onSuccess: () => console.log('Sent!'),
  }
);

async send() {
  try {
    await this.sendEmail.run({ to: 'user@example.com' });
  } catch (error) {
    console.error(error);
  }
}`,
    },
    {
      name: 'injectPaginatedQuery',
      description: 'Infinite scroll and load more patterns',
      code: `readonly todos = injectPaginatedQuery(
  api.todos.listTodosPaginated,
  () => ({}),
  { initialNumItems: 10 }
);

// todos.results() - accumulated results
// todos.loadMore(10) - load more items
// todos.canLoadMore() - has more items
// todos.reset() - reload from start`,
    },
    {
      name: 'injectQueries',
      description: 'Dynamic keyed query groups with separate signals',
      code: `readonly queries = injectQueries(() => ({
  preview: { query: api.todos.listTodos, args: { count: 3 } },
  currentUser: showUser() ? { query: api.auth.getCurrentUser, args: {} } : skipToken,
}));

// queries.results() - keyed query results
// queries.statuses() - per-key status map
// queries.errors() - per-key error map`,
    },
    {
      name: 'injectConvexConnectionState',
      description: 'Live connection diagnostics for network-aware UI',
      code: `readonly connectionState = injectConvexConnectionState();

readonly isReconnecting = computed(
  () => !connectionState().isWebSocketConnected
);

// connectionState().connectionRetries
// connectionState().hasInflightRequests
// connectionState().inflightMutations`,
    },
    {
      name: 'injectPrewarmQuery',
      description: 'Warm a future query before navigation or UI reveal',
      code: `readonly prewarmTodo = injectPrewarmQuery(api.todos.getTodoById);

openTodo(todoId: string) {
  this.prewarmTodo.prewarm({ id: todoId });
  void this.router.navigate(['/todos', todoId]);
}

// Best for route transitions and intent-driven UI`,
    },
    {
      name: 'Paginated optimistic helpers',
      description: 'Keep infinite lists responsive during inserts and inline edits',
      code: `readonly insertMiddle = injectMutation(
  api.optimisticPaginationDemo.createItem,
  {
    optimisticUpdate: (localStore, args) =>
      insertAtPosition({
        paginatedQuery: api.optimisticPaginationDemo.listItemsPaginated,
        argsToMatch: { lane: args.lane },
        sortOrder: 'asc',
        sortKeyFromItem: (item) => item.rank,
        localQueryStore: localStore,
        item: optimisticItem,
      }),
  }
);`,
    },
  ];

  readonly examples = [
    {
      title: 'Basic Example',
      subtitle: 'Todo list using injectQuery, injectMutation, and injectAction',
      body: 'Demonstrates fetching data, adding/completing/deleting todos, and running bulk actions.',
      path: '/examples/basic',
    },
    {
      title: 'Paginated Example',
      subtitle: 'Todo list using injectPaginatedQuery with load more',
      body: 'Demonstrates paginated queries, loading more items, and resetting pagination.',
      path: '/examples/paginated',
    },
    {
      title: 'Authentication Example',
      subtitle: 'Better Auth + Convex session verification with injectAuth',
      body: 'Demonstrates provideConvexAuth, injectAuth, convexAuthGuard, and a protected Convex query using a real Better Auth email/password flow.',
      path: '/auth/login',
    },
    {
      title: 'Multi-query Example',
      subtitle: 'Dynamic keyed queries with injectQueries and skipToken',
      body: 'Demonstrates multiple live queries, removed keys, skipped keys, and aggregate loading across one keyed query object.',
      path: '/examples/multi-query',
    },
    {
      title: 'Connection State Example',
      subtitle: 'Live transport diagnostics with injectConvexConnectionState',
      body: 'Demonstrates connection retries, inflight request tracking, transport status, and a live transition log.',
      path: '/examples/connection-state',
    },
    {
      title: 'Prewarm Query Example',
      subtitle: 'Compare cold loads against injectPrewarmQuery',
      body: 'Demonstrates prewarming a detail query before navigation, with timing data to compare cold and warmed opens.',
      path: '/examples/prewarm-query',
    },
    {
      title: 'Paginated Optimistic Example',
      subtitle: 'Dedicated demo for paginated optimistic update helpers',
      body: 'Demonstrates insertAtTop, insertAtPosition, insertAtBottomIfLoaded, and in-place optimistic row updates on a paginated dataset.',
      path: '/examples/paginated-optimistic',
    },
  ];
}
