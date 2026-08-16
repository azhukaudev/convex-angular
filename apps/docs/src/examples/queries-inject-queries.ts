import { Component, signal } from '@angular/core';
import { injectQueries, skipToken, type QueryRequest } from 'convex-angular';

import { api, type TodoId } from './convex/api';

@Component({
  selector: 'app-dashboard',
  template: `
    @if (dashboard.isLoading()) {
      <span aria-live="polite">Loading dashboard…</span>
    }

    @if (dashboard.statuses().profile === 'skipped') {
      <p>Sign in to see your profile.</p>
    }
    @if (dashboard.results().profile; as profile) {
      <h2>{{ profile.name }}</h2>
    }
    @if (dashboard.errors().todos; as error) {
      <p role="alert">{{ error.message }}</p>
    }

    <!-- A genuinely dynamic key set: dropping an id from pinnedIds
         removes that key from results, errors, and statuses. -->
    @for (id of pinnedIds(); track id) {
      <p>{{ pinned.results()[id]?.title ?? '…' }} ({{ pinned.statuses()[id] }})</p>
    }

    <button type="button" (click)="dashboard.refetch()">Refresh</button>
  `,
})
export class DashboardComponent {
  readonly userId = signal<string | null>(null);

  // A fixed key set. `profile` stays present with status 'skipped' while
  // there is no user — it never disappears from the records.
  readonly dashboard = injectQueries(() => {
    const userId = this.userId();
    return {
      todos: { query: api.todos.list, args: { count: 10 } },
      profile: userId === null ? skipToken : { query: api.users.getProfile, args: { userId } },
    };
  });

  readonly pinnedIds = signal<TodoId[]>(['todo-1' as TodoId, 'todo-2' as TodoId]);

  // A variable key set built from data. Removing an id unsubscribes that
  // query and deletes the key from every record.
  readonly pinned = injectQueries(
    () =>
      Object.fromEntries(this.pinnedIds().map((id) => [id, { query: api.todos.get, args: { id } }])) as Record<
        string,
        QueryRequest<typeof api.todos.get>
      >,
    {
      onSuccess: (key, data) => console.log('pinned', key, data),
      onError: (key, error) => console.error('pinned', key, error),
    },
  );

  unpin(id: TodoId): void {
    this.pinnedIds.update((ids) => ids.filter((pinnedId) => pinnedId !== id));
  }
}
