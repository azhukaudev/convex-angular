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
  ];
}
