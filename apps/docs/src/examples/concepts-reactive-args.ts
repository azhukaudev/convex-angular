import { Component, signal } from '@angular/core';
import { injectQuery, skipToken } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-category-todos',
  template: `
    <button (click)="todos.refetch()">Refetch</button>
    @if (todos.isRefetching()) {
      <span>Refreshing…</span>
    }
  `,
})
export class CategoryTodosComponent {
  readonly category = signal<string | null>(null);

  readonly todos = injectQuery(api.todos.listByCategory, () => {
    const category = this.category();
    // Returning `skipToken` tears down the subscription and moves the query to
    // the 'skipped' status instead of calling the backend with a null value.
    return category === null ? skipToken : { category };
  });

  // Setting the same value produces a structurally identical args object.
  // The subscription key is the serialized args, so this does NOT resubscribe.
  keepSameCategory(): void {
    this.category.set(this.category());
  }
}
