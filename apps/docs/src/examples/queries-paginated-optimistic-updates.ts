import { Component } from '@angular/core';
import {
  injectMutation,
  insertAtBottomIfLoaded,
  insertAtPosition,
  insertAtTop,
  optimisticallyUpdateValueInPaginatedQuery,
  sortByField,
} from 'convex-angular';

import { api, type Todo, type TodoId } from './convex/api';

function draftTodo(title: string): Todo {
  return {
    _id: `optimistic-${title}` as TodoId,
    _creationTime: Date.now(),
    title,
    description: '',
    completed: false,
    priority: 0,
  };
}

@Component({
  selector: 'app-optimistic-todos',
  template: `<button type="button" (click)="add('Buy milk')">Add</button>`,
})
export class OptimisticTodosComponent {
  // 1. optimisticallyUpdateValueInPaginatedQuery takes POSITIONAL arguments.
  readonly complete = injectMutation(api.todos.complete, {
    optimisticUpdate: (localStore, args) => {
      optimisticallyUpdateValueInPaginatedQuery(localStore, api.todos.listPaginated, {}, (todo) =>
        todo._id === args.id ? { ...todo, completed: true } : todo,
      );
    },
  });

  // 2. insertAtTop takes a single OPTIONS OBJECT.
  readonly addNewest = injectMutation(api.todos.create, {
    optimisticUpdate: (localQueryStore, args) => {
      insertAtTop({
        paginatedQuery: api.todos.listPaginated,
        localQueryStore,
        item: draftTodo(args.title),
      });
    },
  });

  // 3. insertAtBottomIfLoaded — a no-op unless the final page is loaded.
  readonly addOldest = injectMutation(api.todos.create, {
    optimisticUpdate: (localQueryStore, args) => {
      insertAtBottomIfLoaded({
        paginatedQuery: api.todos.listPaginatedByCategory,
        argsToMatch: { category: 'work' },
        localQueryStore,
        item: draftTodo(args.title),
      });
    },
  });

  // 4. insertAtPosition — the sort key must reproduce the server ordering,
  //    including a stable tie-breaker.
  readonly addSorted = injectMutation(api.todos.create, {
    optimisticUpdate: (localQueryStore, args) => {
      insertAtPosition({
        paginatedQuery: api.todos.listPaginatedByCategory,
        argsToMatch: { category: 'work' },
        sortOrder: 'desc',
        sortKeyFromItem: sortByField<Pick<Todo, 'priority' | '_creationTime'>>('priority', '_creationTime'),
        localQueryStore,
        item: draftTodo(args.title),
      });
    },
  });

  add(title: string): void {
    void this.addSorted.mutate({ title });
  }
}
