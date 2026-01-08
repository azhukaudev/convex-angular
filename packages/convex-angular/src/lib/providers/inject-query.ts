import {
  DestroyRef,
  Signal,
  assertInInjectionContext,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FunctionReference,
  FunctionReturnType,
  getFunctionName,
} from 'convex/server';

import { SkipToken, skipToken } from '../skip-token';
import { injectConvex } from './inject-convex';

/**
 * A FunctionReference that refers to a Convex query.
 */
export type QueryReference = FunctionReference<'query'>;

/**
 * The result of calling injectQuery.
 */
export interface QueryResult<Query extends QueryReference> {
  /**
   * The current data from the query subscription.
   * Initially populated from local cache if available, then updated reactively.
   */
  data: Signal<FunctionReturnType<Query>>;

  /**
   * The current error, if the query subscription failed.
   * Undefined when there is no error.
   */
  error: Signal<Error | undefined>;

  /**
   * True while waiting for the initial query result.
   * Becomes false once data or error is received.
   */
  isLoading: Signal<boolean>;

  /**
   * True when the query is skipped via skipToken.
   * When skipped, data is undefined and no subscription is active.
   */
  isSkipped: Signal<boolean>;
}

/**
 * Subscribe to a Convex query reactively.
 *
 * The query automatically re-subscribes when its arguments change.
 * Results are cached locally and updated in real-time.
 *
 * @example
 * ```typescript
 * // Simple query with no arguments
 * const todos = injectQuery(api.todos.list, () => ({}));
 *
 * // Query with reactive arguments
 * const category = signal('work');
 * const filteredTodos = injectQuery(
 *   api.todos.listByCategory,
 *   () => ({ category: category() }),
 * );
 *
 * // Conditionally skipped query using skipToken
 * const userId = signal<string | null>(null);
 * const userProfile = injectQuery(
 *   api.users.getProfile,
 *   () => userId() ? { userId: userId() } : skipToken,
 * );
 *
 * // In template:
 * // @if (todos.isLoading()) {
 * //   <span>Loading...</span>
 * // } @else if (todos.isSkipped()) {
 * //   <span>Select a user to view profile</span>
 * // } @else if (todos.error()) {
 * //   <span>Error: {{ todos.error()?.message }}</span>
 * // } @else {
 * //   @for (todo of todos.data(); track todo._id) {
 * //     <div>{{ todo.title }}</div>
 * //   }
 * // }
 * ```
 *
 * @param query - A FunctionReference to the query function
 * @param argsFn - A reactive function returning the query arguments, or skipToken to skip the query
 * @returns A QueryResult with reactive data, error, loading, and skipped signals
 */
export function injectQuery<Query extends QueryReference>(
  query: Query,
  argsFn: () => Query['_args'] | SkipToken,
): QueryResult<Query> {
  assertInInjectionContext(injectQuery);
  const convex = injectConvex();
  const destroyRef = inject(DestroyRef);

  // Initialize signals
  const data = signal<FunctionReturnType<Query>>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);
  const isSkipped = signal(false);

  // Track current subscription for cleanup
  let unsubscribe: (() => void) | undefined;

  // Effect to reactively subscribe when args change
  effect(() => {
    const args = argsFn();

    // Cleanup previous subscription
    unsubscribe?.();

    // If skipToken, reset state and don't subscribe
    if (args === skipToken) {
      data.set(undefined);
      error.set(undefined);
      isLoading.set(false);
      isSkipped.set(true);
      return;
    }

    // Not skipped - try to get cached data and start subscription
    isSkipped.set(false);
    isLoading.set(true);

    // Initialize with cached data if available
    const cachedData = convex.client.localQueryResult(
      getFunctionName(query),
      args,
    );
    if (cachedData !== undefined) {
      data.set(cachedData);
    }

    // Subscribe to the query
    unsubscribe = convex.onUpdate(
      query,
      args,
      (result: FunctionReturnType<Query>) => {
        data.set(result);
        error.set(undefined);
        isLoading.set(false);
      },
      (err: Error) => {
        data.set(undefined);
        error.set(err);
        isLoading.set(false);
      },
    );
  });

  // Cleanup subscription when component is destroyed
  destroyRef.onDestroy(() => unsubscribe?.());

  return {
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
    isSkipped: isSkipped.asReadonly(),
  };
}
