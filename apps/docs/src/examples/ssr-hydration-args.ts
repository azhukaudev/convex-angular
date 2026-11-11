import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap } from '@angular/router';
import { convexQueryResolver, injectQuery } from 'convex-angular';
import { FunctionReference } from 'convex/server';

import { Todo } from './convex/api';

// Stand-in for a generated query reference with more than one argument.
const searchTodos = {} as FunctionReference<'query', 'public', { category: string; completed: boolean }, Todo[]>;

/**
 * Build the args in exactly one place.
 *
 * The TransferState key is `JSON.stringify(convexToJson(args))`. Property
 * order does not matter (`convexToJson` sorts keys), but every value does. A
 * single builder keeps the resolver and the component passing the same values
 * and keeps hydration matching.
 */
export function searchTodosArgs(category: string): { category: string; completed: boolean } {
  return { category, completed: false };
}

/** The route's `:category`, read the same way by the resolver and the component. */
function categoryFrom(paramMap: ParamMap): string {
  return paramMap.get('category') ?? 'work';
}

export const searchTodosResolver = convexQueryResolver(searchTodos, (route) =>
  searchTodosArgs(categoryFrom(route.paramMap)),
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
  // A signal, not `route.snapshot`: the router reuses this component when only
  // `:category` changes, and the args must follow it.
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });

  // Same input, same builder, same values, same TransferState key.
  readonly todos = injectQuery(searchTodos, () => searchTodosArgs(categoryFrom(this.params())));
}
