import { Component } from '@angular/core';
import { injectMutation } from 'convex-angular';
import type { OptimisticUpdate } from 'convex/browser';

import { api, type TodoId } from './convex/api';

// `getAllQueries` returns every locally cached result for a query name,
// whatever arguments each subscription used. Use it when the same document can
// appear in several argument variants of the same query.
const completeTodoOptimistically: OptimisticUpdate<{ id: TodoId }> = (localStore, args) => {
  for (const { args: queryArgs, value } of localStore.getAllQueries(api.todos.list)) {
    if (value === undefined) {
      continue;
    }

    localStore.setQuery(
      api.todos.list,
      queryArgs,
      value.map((todo) => (todo._id === args.id ? { ...todo, completed: true } : todo)),
    );
  }
};

@Component({
  selector: 'app-complete-todo',
  template: `<button type="button" (click)="complete()">Complete</button>`,
})
export class CompleteTodoComponent {
  readonly completeTodo = injectMutation(api.todos.complete, {
    optimisticUpdate: completeTodoOptimistically,
  });

  complete(): void {
    void this.completeTodo.mutate({ id: 'todo-id' as TodoId }).catch(() => undefined);
  }
}
