import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectQuery } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { TodoMutationsBase } from '../shared/todo-mutations-base';

@Component({
  imports: [FormsModule, ButtonModule, CheckboxModule, InputTextModule, ProgressSpinnerModule],
  selector: 'cva-todo-list',
  templateUrl: 'todo-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class TodoList extends TodoMutationsBase {
  readonly count = model(20);

  readonly todos = injectQuery(api.todos.listTodos, () => ({
    count: this.count(),
  }));
}
