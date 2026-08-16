import { Injectable } from '@angular/core';
import { injectConvex } from 'convex-angular';

import { api } from './convex/api';

@Injectable({ providedIn: 'root' })
export class TodoAdminService {
  // The very same ConvexClient instance provideConvex(...) registered under
  // the CONVEX token. Throws if provideConvex(...) was never called.
  private readonly convex = injectConvex();

  /** One-shot query outside of any subscription. */
  async count(): Promise<number> {
    const todos = await this.convex.query(api.todos.list, { count: 100 });
    return todos.length;
  }

  /** Imperative mutation, for code that is not a component interaction. */
  async create(title: string): Promise<void> {
    await this.convex.mutation(api.todos.create, { title });
  }

  /** Imperative action. */
  async completeAll(): Promise<number> {
    return this.convex.action(api.todos.completeAll, {});
  }

  /** Manual subscription; you own the unsubscribe. */
  watch(onTodos: (titles: string[]) => void): () => void {
    return this.convex.onUpdate(api.todos.list, { count: 100 }, (todos) => {
      onTodos(todos.map((todo) => todo.title));
    });
  }
}
