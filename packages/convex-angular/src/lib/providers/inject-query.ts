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

import { injectConvex } from './inject-convex';

/**
 * A FunctionReference that refers to a Convex query.
 */
export type QueryReference = FunctionReference<'query'>;

/**
 * Options for injectQuery.
 */
export interface QueryOptions {
  /**
   * Whether the query subscription is enabled.
   * When false, the query will not subscribe and data will be undefined.
   * Defaults to true.
   */
  enabled?: boolean;
}

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
 * // Conditionally enabled query
 * const userId = signal<string | null>(null);
 * const userProfile = injectQuery(
 *   api.users.getProfile,
 *   () => ({ userId: userId()! }),
 *   () => ({ enabled: userId() !== null }),
 * );
 *
 * // In template:
 * // @if (todos.isLoading()) {
 * //   <span>Loading...</span>
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
 * @param argsFn - A reactive function returning the query arguments
 * @param optionsFn - Optional reactive function returning query options
 * @returns A QueryResult with reactive data, error, and loading signals
 */
export function injectQuery<Query extends QueryReference>(
  query: Query,
  argsFn: () => Query['_args'],
  optionsFn?: () => QueryOptions,
): QueryResult<Query> {
  assertInInjectionContext(injectQuery);
  const convex = injectConvex();
  const destroyRef = inject(DestroyRef);

  // Initialize with cached data if available
  const data = signal<FunctionReturnType<Query>>(
    convex.client.localQueryResult(getFunctionName(query), argsFn()),
  );
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);

  // Track current subscription for cleanup
  let unsubscribe: (() => void) | undefined;

  // Effect to reactively subscribe when args or options change
  effect(() => {
    const options = optionsFn?.();
    const enabled = options?.enabled ?? true;

    // Cleanup previous subscription
    unsubscribe?.();

    // If disabled, reset state and don't subscribe
    if (!enabled) {
      data.set(undefined);
      error.set(undefined);
      isLoading.set(false);
      return;
    }

    isLoading.set(true);

    // Subscribe to the query
    unsubscribe = convex.onUpdate(
      query,
      argsFn(),
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
  };
}
