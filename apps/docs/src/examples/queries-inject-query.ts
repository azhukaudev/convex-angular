import { Component, signal } from '@angular/core';
import { ConvexError, injectQuery } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-todo-list',
  template: `
    <label>
      Page size
      <input type="number" [value]="count()" (input)="count.set(+$any($event.target).value)" />
    </label>

    <!-- isRefetching() is true only while a previous value is still on
         screen, so it drives a subtle affordance rather than a skeleton. -->
    @if (todos.isRefetching()) {
      <span aria-live="polite">Refreshing…</span>
    }

    @switch (todos.status()) {
      @case ('pending') {
        @if (!todos.isRefetching()) {
          <p>Loading…</p>
        }
      }
      @case ('error') {
        <p role="alert">{{ todos.error()?.message }}</p>
        <button type="button" (click)="todos.refetch()">Try again</button>
      }
      @case ('success') {
        <ul>
          @for (todo of todos.data() ?? []; track todo._id) {
            <li>{{ todo.title }}</li>
          }
        </ul>
      }
    }
  `,
})
export class TodoListComponent {
  readonly count = signal(20);

  // Every signal read inside the argument function is tracked. Changing
  // `count` re-runs it, and because the serialized args differ the helper
  // tears down the old subscription and opens a new one. `data()` keeps the
  // previous page until the new one arrives.
  readonly todos = injectQuery(api.todos.list, () => ({ count: this.count() }), {
    // Fires for real emissions only — never for a warm-cache seed, data
    // transferred from a server render, or `placeholderData`.
    onSuccess: (todos) => console.log('loaded', todos.length, 'todos'),
    onError: (error) => {
      // Errors thrown by the Convex function with `ConvexError` carry a
      // typed payload.
      if (error instanceof ConvexError) {
        console.error(error.data);
      }
    },
  });
}
