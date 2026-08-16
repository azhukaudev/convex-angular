import { Component, signal } from '@angular/core';
import { injectPaginatedQuery, skipToken } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-paginated-todos',
  template: `
    @switch (todos.status()) {
      @case ('skipped') {
        <p>Pick a category.</p>
      }
      @case ('pending') {
        <p>Loading first page…</p>
      }
      @case ('error') {
        <p role="alert">{{ todos.error()?.message }}</p>
        <button type="button" (click)="todos.reset()">Start over</button>
      }
      @case ('success') {
        <ul>
          @for (todo of todos.results(); track todo._id) {
            <li>{{ todo.title }}</li>
          }
        </ul>
      }
    }

    <!-- isLoadingMore() is also part of the disabled condition: during a
         load-more round trip the client reports canLoadMore === false. -->
    @if (!todos.isExhausted()) {
      <button type="button" [disabled]="!todos.canLoadMore() || todos.isLoadingMore()" (click)="loadMore()">
        {{ todos.isLoadingMore() ? 'Loading…' : 'Load more' }}
      </button>
    }
  `,
})
export class PaginatedTodosComponent {
  readonly category = signal<string | null>('work');

  // `initialNumItems` accepts a plain number or a Signal. Changing the
  // signal changes the subscription identity and restarts pagination.
  readonly pageSize = signal(10);

  readonly todos = injectPaginatedQuery(
    api.todos.listPaginatedByCategory,
    () => {
      const category = this.category();
      return category === null ? skipToken : { category };
    },
    {
      initialNumItems: this.pageSize,
      onSuccess: (results) => console.log('page loaded, total items:', results.length),
      onError: (error) => console.error(error),
    },
  );

  loadMore(): void {
    // `loadMore()` reports whether the request was actually started. After
    // hydration it can return false while `canLoadMore()` is already true.
    const started = this.todos.loadMore(this.pageSize());
    if (!started) {
      console.debug('load more not started yet — the subscription has not synced');
    }
  }
}
