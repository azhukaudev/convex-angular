import { Component, computed } from '@angular/core';
import { ConvexError, injectMutation, injectQuery } from 'convex-angular';

import { TodoId, api } from './convex/api';

@Component({
  selector: 'app-todo-errors',
  template: `
    @if (todos.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
    @if (validationMessage(); as message) {
      <p role="alert">{{ message }}</p>
    }
  `,
})
export class TodoErrorsComponent {
  readonly todos = injectQuery(api.todos.list, () => ({ count: 20 }));
  readonly completeTodo = injectMutation(api.todos.complete);

  // `ConvexError` is re-exported by convex-angular so you can narrow helper
  // errors without importing from `convex/values` directly.
  readonly validationMessage = computed(() => {
    const error = this.todos.error();
    return error instanceof ConvexError ? String(error.data) : undefined;
  });

  async complete(id: TodoId): Promise<void> {
    try {
      // The rejection and `completeTodo.error()` carry the same Error instance.
      await this.completeTodo.mutate({ id });
    } catch (error) {
      if (error instanceof ConvexError) {
        // Application error thrown by your Convex function: `.data` is the
        // payload you passed to `new ConvexError(...)`.
        console.error('rejected by the backend', error.data);
      } else if (error instanceof Error) {
        // Anything else — including a non-Error throw, which the helper
        // normalizes to `new Error(String(err))`.
        console.error(error.message);
      }
    }
  }
}
