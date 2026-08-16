import { EnvironmentInjector, Injectable, inject } from '@angular/core';
import { QueryResult, injectQuery } from 'convex-angular';

import { api } from './convex/api';

type TodoListQuery = QueryResult<typeof api.todos.list>;

@Injectable({ providedIn: 'root' })
export class TodoListCache {
  // Captured while we ARE in an injection context (a field initializer).
  private readonly injector = inject(EnvironmentInjector);

  private readonly byCount = new Map<number, TodoListQuery>();

  // Called later from plain code — there is no ambient injection context here,
  // so `injectQuery` would throw without `injectRef`.
  forCount(count: number): TodoListQuery {
    const cached = this.byCount.get(count);
    if (cached) {
      return cached;
    }

    // Ownership follows `injectRef`, not the caller: this subscription lives
    // until the root injector is destroyed, and is cached so repeated calls do
    // not open a new subscription every time.
    const query = injectQuery(api.todos.list, () => ({ count }), { injectRef: this.injector });
    this.byCount.set(count, query);
    return query;
  }
}
