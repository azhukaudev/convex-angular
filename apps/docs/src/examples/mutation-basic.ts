import { Component } from '@angular/core';
import { ConvexError, injectMutation } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-add-todo',
  template: `
    <button (click)="add()" [disabled]="createTodo.isLoading()">Add todo</button>
    @if (createTodo.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
  `,
})
export class AddTodoComponent {
  readonly createTodo = injectMutation(api.todos.create, {
    onSuccess: (id) => console.log('created', id),
  });

  async add(): Promise<void> {
    try {
      // `mutate()` rejects on failure *and* mirrors the error into `error()`.
      await this.createTodo.mutate({ title: 'Buy groceries' });
    } catch (error) {
      // Narrow application errors thrown by your Convex function to read
      // their typed payload.
      if (error instanceof ConvexError) {
        console.error(error.data);
      }
    }
  }
}
