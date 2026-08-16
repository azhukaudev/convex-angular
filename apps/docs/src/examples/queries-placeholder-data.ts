import { Component, signal } from '@angular/core';
import { injectQuery } from 'convex-angular';

import { api, type TodoId } from './convex/api';

@Component({
  selector: 'app-todo-master-detail',
  template: `
    <ul>
      @for (todo of list.data() ?? []; track todo._id) {
        <li>
          <button type="button" (click)="selectedId.set(todo._id)">{{ todo.title }}</button>
        </li>
      }
    </ul>

    @if (detail.data(); as todo) {
      <!-- The title renders immediately from the list row; the description
           only exists on the real document. -->
      <h2 [class.is-stale]="detail.isPlaceholderData()">{{ todo.title }}</h2>
      @if (detail.isPlaceholderData()) {
        <p aria-live="polite">Loading details…</p>
      } @else {
        <p>{{ todo.description }}</p>
      }
    }

    @if (detail.error(); as error) {
      <!-- data() is already cleared here: a placeholder is never shown
           next to an error. -->
      <p role="alert">{{ error.message }}</p>
    }
  `,
})
export class TodoMasterDetailComponent {
  readonly selectedId = signal<TodoId>('todo-1' as TodoId);

  readonly list = injectQuery(api.todos.list, () => ({ count: 20 }));

  readonly detail = injectQuery(api.todos.get, () => ({ id: this.selectedId() }), {
    // A factory receives the current args. It runs inside `untracked()`, so
    // reading `list.data()` here does NOT make the detail subscription
    // depend on the list query.
    placeholderData: (args) => this.list.data()?.find((todo) => todo._id === args.id),
  });
}
