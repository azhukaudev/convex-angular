import { Component, signal } from '@angular/core';
import { injectQuery, skipToken } from 'convex-angular';

import { api, type TodoId } from './convex/api';

@Component({
  selector: 'app-todo-detail',
  template: `
    @switch (todo.status()) {
      @case ('skipped') {
        <p>Select a todo to see its details.</p>
      }
      @case ('pending') {
        <p>Loading…</p>
      }
      @case ('error') {
        <p role="alert">{{ todo.error()?.message }}</p>
      }
      @case ('success') {
        <h2>{{ todo.data()?.title }}</h2>
        <p>{{ todo.data()?.description }}</p>
      }
    }
  `,
})
export class TodoDetailComponent {
  readonly selectedId = signal<TodoId | null>(null);

  // The condition lives *inside* the argument function. Never wrap the
  // `injectQuery` call itself in an `@if` — helpers must be created
  // unconditionally in an injection context.
  readonly todo = injectQuery(api.todos.get, () => {
    const id = this.selectedId();
    return id === null ? skipToken : { id };
  });

  select(id: TodoId | null): void {
    this.selectedId.set(id);
  }
}
