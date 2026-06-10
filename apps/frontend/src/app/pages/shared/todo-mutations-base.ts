import { Directive, model } from '@angular/core';
import { injectAction, injectMutation } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

/**
 * Shared todo mutation bindings and handlers used by both the live list and
 * the paginated list demos, so each page only contains the code specific to
 * the helper it demonstrates.
 */
@Directive()
export abstract class TodoMutationsBase {
  readonly newTask = model('');

  readonly addTodo = injectMutation(api.todos.addTodo, {
    onSuccess: () => this.newTask.set(''),
  });
  readonly completeTodo = injectMutation(api.todos.completeTodo);
  readonly reopenTodo = injectMutation(api.todos.reopenTodo);
  readonly deleteTodo = injectMutation(api.todos.deleteTodo);

  readonly completeAll = injectAction(api.todoFunctions.completeAllTodos);
  readonly reopenAll = injectAction(api.todoFunctions.reopenAllTodos);

  handleTodoChange(id: Id<'todos'>, completed: boolean) {
    if (completed) {
      void this.runOperation(this.reopenTodo.mutate({ id }));
      return;
    }

    void this.runOperation(this.completeTodo.mutate({ id }));
  }

  handleAddTodo() {
    void this.runOperation(this.addTodo.mutate({ title: this.newTask() }));
  }

  handleDeleteTodo(id: Id<'todos'>) {
    void this.runOperation(this.deleteTodo.mutate({ id }));
  }

  handleCompleteAll() {
    void this.runOperation(this.completeAll.run({}));
  }

  handleReopenAll() {
    void this.runOperation(this.reopenAll.run({}));
  }

  protected async runOperation(operation: Promise<unknown>) {
    try {
      await operation;
    } catch (error) {
      console.error(error);
    }
  }
}
