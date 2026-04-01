import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  imports: [RouterLink, ButtonModule, CardModule],
  selector: 'cva-landing',
  templateUrl: 'landing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class Landing {
  readonly examplePages = [
    {
      title: 'Basic Example',
      subtitle: 'Todo list using injectQuery, injectMutation, and injectAction',
      description: 'Demonstrates fetching data, adding/completing/deleting todos, and running bulk actions.',
      href: '/examples/basic',
    },
    {
      title: 'Paginated Example',
      subtitle: 'Todo list using injectPaginatedQuery with load more',
      description: 'Demonstrates paginated queries, loading more items, and resetting pagination.',
      href: '/examples/paginated',
    },
    {
      title: 'Authentication Example',
      subtitle: 'Better Auth + Convex session verification with injectAuth',
      description:
        'Demonstrates provideConvexAuth, injectAuth, convexAuthGuard, and a protected Convex query using a real Better Auth email/password flow.',
      href: '/auth/login',
    },
    {
      title: 'Multi-query Example',
      subtitle: 'Dynamic keyed queries with injectQueries and skipToken',
      description:
        'Demonstrates multiple live queries, removed keys, skipped keys, and aggregate loading across one keyed query object.',
      href: '/examples/multi-query',
    },
    {
      title: 'Connection State Example',
      subtitle: 'Live transport diagnostics with injectConvexConnectionState',
      description:
        'Demonstrates connection retries, inflight request tracking, transport status, and a live transition log.',
      href: '/examples/connection-state',
    },
    {
      title: 'Prewarm Query Example',
      subtitle: 'Compare cold loads against injectPrewarmQuery',
      description:
        'Demonstrates prewarming a detail query before navigation, with timing data to compare cold and warmed opens.',
      href: '/examples/prewarm-query',
    },
    {
      title: 'Paginated Optimistic Example',
      subtitle: 'Dedicated demo for paginated optimistic update helpers',
      description:
        'Demonstrates insertAtTop, insertAtPosition, insertAtBottomIfLoaded, and in-place optimistic row updates on a paginated dataset.',
      href: '/examples/paginated-optimistic',
    },
  ];

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
    await this.addTodo({ title: 'New task' });
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
    await this.sendEmail({ to: 'user@example.com' });
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
).withOptimisticUpdate((localStore, args) =>
  insertAtPosition({
    paginatedQuery: api.optimisticPaginationDemo.listItemsPaginated,
    argsToMatch: { lane: args.lane },
    sortOrder: 'asc',
    sortKeyFromItem: (item) => item.rank,
    localQueryStore: localStore,
    item: optimisticItem,
  })
);`,
    },
  ];
}
