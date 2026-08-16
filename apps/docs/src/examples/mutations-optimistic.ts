import { Component } from '@angular/core';
import { injectMutation, injectQuery } from 'convex-angular';

import { api, type TodoId } from './convex/api';

const LIST_ARGS = { count: 20 };

@Component({
  selector: 'app-todo-list',
  template: `
    @for (todo of todos.data() ?? []; track todo._id) {
      <label>
        <input type="checkbox" [checked]="todo.completed" (change)="complete(todo._id)" />
        {{ todo.title }}
      </label>
    }
  `,
})
export class TodoListComponent {
  readonly todos = injectQuery(api.todos.list, () => LIST_ARGS);

  readonly completeTodo = injectMutation(api.todos.complete, {
    optimisticUpdate: (localStore, args) => {
      // Read the current client-side result for this exact query + args pair.
      // `undefined` means the query is not loaded in this client, so there is
      // nothing to update.
      const todos = localStore.getQuery(api.todos.list, LIST_ARGS);
      if (todos === undefined) {
        return;
      }

      // Query results are immutable: build new objects instead of mutating.
      localStore.setQuery(
        api.todos.list,
        LIST_ARGS,
        todos.map((todo) => (todo._id === args.id ? { ...todo, completed: true } : todo)),
      );
    },
  });

  complete(id: TodoId): void {
    void this.completeTodo.mutate({ id }).catch(() => undefined);
  }
}
