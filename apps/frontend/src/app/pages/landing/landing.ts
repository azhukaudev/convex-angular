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

// Usage: addTodo.mutate({ title: 'New task' })`,
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

// Usage: sendEmail.run({ to: 'user@example.com' })`,
    },
    {
      name: 'injectPaginatedQuery',
      description: 'Infinite scroll and load more patterns',
      code: `readonly todos = injectPaginatedQuery(
  api.todos.listPaginated,
  () => ({}),
  () => ({ initialNumItems: 10 })
);

// todos.results() - accumulated results
// todos.loadMore(10) - load more items
// todos.canLoadMore() - has more items
// todos.reset() - reload from start`,
    },
  ];
}
