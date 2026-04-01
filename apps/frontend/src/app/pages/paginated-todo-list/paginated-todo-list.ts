import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectPaginatedQuery } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { createTodoPageActions } from '../shared/todo-page-actions';
import { TodoPageComponent } from '../shared/todo-page/todo-page';

@Component({
  imports: [FormsModule, ButtonModule, InputNumberModule, ProgressSpinnerModule, TodoPageComponent],
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
  readonly todoActions = createTodoPageActions(this.newTask);

  readonly todos = injectPaginatedQuery(api.todos.listTodosPaginated, () => ({}), { initialNumItems: this.pageSize });

  handleLoadMore() {
    this.todos.loadMore(this.pageSize());
  }

  handleRetry() {
    if (this.todos.canLoadMore()) {
      this.todos.loadMore(this.pageSize());
      return;
    }

    this.todos.reset();
  }

  handleReset() {
    this.todos.reset();
  }
}
