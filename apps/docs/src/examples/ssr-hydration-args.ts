import { Component } from '@angular/core';
import { convexQueryResolver, injectQuery } from 'convex-angular';
import { FunctionReference } from 'convex/server';

import { Todo } from './convex/api';

// Stand-in for a generated query reference with more than one argument.
const searchTodos = {} as FunctionReference<'query', 'public', { category: string; completed: boolean }, Todo[]>;

/**
 * Build the args in exactly one place.
 *
 * The TransferState key is `JSON.stringify(convexToJson(args))`, so
 * `{ category, completed }` and `{ completed, category }` are different keys
 * even though they are the same arguments. A single builder makes the property
 * order identical everywhere and keeps hydration matching.
 */
export function searchTodosArgs(category: string): { category: string; completed: boolean } {
  return { category, completed: false };
}

export const searchTodosResolver = convexQueryResolver(searchTodos, (route) =>
  searchTodosArgs(route.paramMap.get('category') ?? 'work'),
);

@Component({
  selector: 'app-todo-search',
  template: `
    @for (todo of todos.data() ?? []; track todo._id) {
      <p>{{ todo.title }}</p>
    }
  `,
})
export class TodoSearchComponent {
  // Same builder, same property order, same TransferState key.
  readonly todos = injectQuery(searchTodos, () => searchTodosArgs('work'));
}
