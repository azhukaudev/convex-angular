import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectPaginatedQuery } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { TodoMutationsBase } from '../shared/todo-mutations-base';

@Component({
  imports: [FormsModule, ButtonModule, CheckboxModule, InputNumberModule, InputTextModule, ProgressSpinnerModule],
  selector: 'cva-paginated-todo-list',
  templateUrl: 'paginated-todo-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class PaginatedTodoList extends TodoMutationsBase {
  readonly pageSize = model(5);

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
