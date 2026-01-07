import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  injectAction,
  injectMutation,
  injectPaginatedQuery,
} from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

@Component({
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    ProgressSpinnerModule,
  ],
  selector: 'cva-paginated-todo-list',
  templateUrl: 'paginated-todo-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class PaginatedTodoList {
  readonly newTask = model('');
  readonly pageSize = model(5);

  readonly todos = injectPaginatedQuery(
    api.todos.listTodosPaginated,
    () => ({}),
    () => ({ initialNumItems: this.pageSize() }),
  );

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
      this.reopenTodo.mutate({ id });
    } else {
      this.completeTodo.mutate({ id });
    }
  }

  handleAddTodo() {
    this.addTodo.mutate({ title: this.newTask() });
  }

  handleDeleteTodo(id: Id<'todos'>) {
    this.deleteTodo.mutate({ id });
  }

  handleCompleteAll() {
    this.completeAll.run({});
  }

  handleReopenAll() {
    this.reopenAll.run({});
  }

  handleLoadMore() {
    this.todos.loadMore(this.pageSize());
  }

  handleReset() {
    this.todos.reset();
  }
}
