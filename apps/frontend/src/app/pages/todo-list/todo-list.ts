import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectAction, injectMutation, injectQuery } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

@Component({
  imports: [FormsModule, ButtonModule, CheckboxModule, InputTextModule, ProgressSpinnerModule],
  selector: 'cva-todo-list',
  templateUrl: 'todo-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class TodoList {
  readonly newTask = model('');
  readonly count = model(20);

  readonly todos = injectQuery(api.todos.listTodos, () => ({
    count: this.count(),
  }));

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
      void this.runOperation(this.reopenTodo({ id }));
      return;
    }

    void this.runOperation(this.completeTodo({ id }));
  }

  handleAddTodo() {
    void this.runOperation(this.addTodo({ title: this.newTask() }));
  }

  handleDeleteTodo(id: Id<'todos'>) {
    void this.runOperation(this.deleteTodo({ id }));
  }

  handleCompleteAll() {
    void this.runOperation(this.completeAll({}));
  }

  handleReopenAll() {
    void this.runOperation(this.reopenAll({}));
  }

  private async runOperation(operation: Promise<unknown>) {
    try {
      await operation;
    } catch (error) {
      console.error(error);
    }
  }
}
