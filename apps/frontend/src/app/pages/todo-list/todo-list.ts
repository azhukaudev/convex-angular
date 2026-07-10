import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { injectQuery } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { PageHeader } from '../shared/page-header/page-header';
import { TodoItem } from '../shared/todo-item/todo-item';
import { TodoMutationsBase } from '../shared/todo-mutations-base';

@Component({
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    PageHeader,
    TodoItem,
  ],
  selector: 'cva-todo-list',
  templateUrl: 'todo-list.html',
  styleUrl: 'todo-list.scss',
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
