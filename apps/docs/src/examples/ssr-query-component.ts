import { Component } from '@angular/core';
import { injectQuery } from 'convex-angular';

import { api } from './convex/api';

/**
 * There is no SSR-specific code in a component. On the server the query is a
 * one-shot HTTP fetch that Angular waits for; in the browser the same call
 * seeds from the transferred result and then opens the live subscription.
 */
@Component({
  selector: 'app-todo-page',
  template: `
    @switch (todos.status()) {
      @case ('pending') {
        <p>Loading…</p>
      }
      @case ('error') {
        <p>{{ todos.error()?.message }}</p>
      }
      @case ('success') {
        @for (todo of todos.data() ?? []; track todo._id) {
          <p>{{ todo.title }}</p>
        }
      }
    }
  `,
})
export class TodoPageComponent {
  // Server render: 'pending' -> 'success' once the HTTP fetch settles.
  // Hydrated browser render: 'success' on the first change detection, because
  // the transferred result seeds the query synchronously.
  readonly todos = injectQuery(api.todos.list, () => ({ count: 20 }));
}
