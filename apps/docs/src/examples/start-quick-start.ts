import { Component, signal } from '@angular/core';
import { injectMutation, injectQuery } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-todo-list',
  template: `
    <form (submit)="add($event)">
      <input name="title" [value]="title()" (input)="title.set($any($event.target).value)" />
      <button type="submit" [disabled]="createTodo.isLoading()">
        {{ createTodo.isLoading() ? 'Adding…' : 'Add todo' }}
      </button>
    </form>

    @if (createTodo.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }

    @switch (todos.status()) {
      @case ('pending') {
        <p>Loading todos…</p>
      }
      @case ('error') {
        <p role="alert">{{ todos.error()?.message }}</p>
      }
      @case ('skipped') {
        <p>Nothing to load.</p>
      }
      @case ('success') {
        <ul>
          @for (todo of todos.data() ?? []; track todo._id) {
            <li>{{ todo.title }}</li>
          } @empty {
            <li>No todos yet.</li>
          }
        </ul>
      }
    }
  `,
})
export class TodoListComponent {
  readonly title = signal('');

  // The argument function is reactive: reading `count()` inside it makes the
  // subscription follow the signal.
  readonly count = signal(20);
  readonly todos = injectQuery(api.todos.list, () => ({ count: this.count() }));

  readonly createTodo = injectMutation(api.todos.create, {
    onSuccess: () => this.title.set(''),
  });

  add(event: Event): void {
    event.preventDefault();
    // No manual refetch: the live query subscription pushes the new todo.
    // A failure is shown through `createTodo.error()`; the promise still
    // rejects, so catch it to avoid an unhandled rejection.
    void this.createTodo.mutate({ title: this.title() }).catch(() => undefined);
  }
}
