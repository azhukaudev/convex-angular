import { Component, signal } from '@angular/core';
import { injectQuery } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-safe-todo-list',
  template: `
    @switch (todos.status()) {
      @case ('pending') {
        <p>Loading…</p>
      }
      @case ('skipped') {
        <p>Nothing selected.</p>
      }
      @case ('error') {
        <p role="alert">{{ todos.error()?.message }}</p>
      }
      @case ('success') {
        <!-- Never assume 'success' implies data(): before the first change
             detection the subscription effect has not run yet, so status() is
             'success' while data() is still undefined. Bind the value. -->
        @if (todos.data(); as list) {
          @for (todo of list; track todo._id) {
            <p>{{ todo.title }}</p>
          }
        } @else {
          <p>Loading…</p>
        }
      }
    }
  `,
})
export class SafeTodoListComponent {
  readonly count = signal(20);
  readonly todos = injectQuery(api.todos.list, () => ({ count: this.count() }));
}
