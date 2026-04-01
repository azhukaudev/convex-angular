import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { injectQuery } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { createTodoPageActions } from '../shared/todo-page-actions';
import { TodoPageComponent } from '../shared/todo-page/todo-page';

@Component({
  imports: [TodoPageComponent],
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
  readonly todoActions = createTodoPageActions(this.newTask);

  readonly todos = injectQuery(api.todos.listTodos, () => ({
    count: this.count(),
  }));
}
