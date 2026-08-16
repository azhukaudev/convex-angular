import { Component, input } from '@angular/core';
import { injectMutation } from 'convex-angular';

import { api, type TodoId } from './convex/api';

@Component({
  selector: 'app-delete-todo',
  template: `
    <button type="button" (click)="remove()" [disabled]="removeTodo.isLoading()">Delete</button>

    @switch (removeTodo.status()) {
      @case ('idle') {
        <!-- Never called, or reset() was called. -->
      }
      @case ('pending') {
        <span>Deleting…</span>
      }
      @case ('success') {
        <span>Deleted</span>
        <button type="button" (click)="removeTodo.reset()">Dismiss</button>
      }
      @case ('error') {
        <span role="alert">{{ removeTodo.error()?.message }}</span>
        <button type="button" (click)="removeTodo.reset()">Dismiss</button>
      }
    }
  `,
})
export class DeleteTodoComponent {
  readonly todoId = input.required<TodoId>();

  readonly removeTodo = injectMutation(api.todos.remove);

  remove(): void {
    // The rejection is already mirrored into `removeTodo.error()`, but the
    // promise still rejects, so it must be handled to avoid an unhandled
    // rejection.
    void this.removeTodo.mutate({ id: this.todoId() }).catch(() => undefined);
  }
}
