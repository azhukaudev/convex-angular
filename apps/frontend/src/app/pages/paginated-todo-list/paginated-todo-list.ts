import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { injectPaginatedQuery } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { clampNumber } from '../shared/clamp-number';
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
  selector: 'cva-paginated-todo-list',
  templateUrl: 'paginated-todo-list.html',
  styleUrl: 'paginated-todo-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PaginatedTodoList extends TodoMutationsBase {
  // Holds null while the field is cleared; consumers use effectivePageSize.
  readonly pageSize = model<number | null>(5);
  readonly effectivePageSize = computed(() => clampNumber(this.pageSize(), 1, 50, 5));

  readonly todos = injectPaginatedQuery(api.todos.listTodosPaginated, () => ({}), {
    initialNumItems: this.effectivePageSize,
  });

  handleLoadMore() {
    this.todos.loadMore(this.effectivePageSize());
  }

  handleRetry() {
    if (this.todos.canLoadMore()) {
      this.todos.loadMore(this.effectivePageSize());
      return;
    }

    this.todos.reset();
  }

  handleReset() {
    this.todos.reset();
  }
}
