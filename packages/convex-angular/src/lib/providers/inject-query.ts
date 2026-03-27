import { DestroyRef, EnvironmentInjector, Signal, computed, effect, inject, signal } from '@angular/core';
import { FunctionReference, FunctionReturnType, getFunctionName } from 'convex/server';
import { Value } from 'convex/values';

import { SkipToken, skipToken } from '../skip-token';
import { QueryStatus } from '../types';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';
import { createSubscriptionController, serializeArgs } from './query-subscription-lifecycle';

/**
 * A FunctionReference that refers to a Convex query.
 */
export type QueryReference = FunctionReference<'query'>;

/**
 * Options for injectQuery.
 */
export interface QueryOptions<Query extends QueryReference> {
  /**
   * Environment injector used to create the query outside the current
   * injection context.
   */
  injectRef?: EnvironmentInjector;

  /**
   * Callback invoked when the query receives data.
   * Called on initial load and every subsequent update.
   * @param data - The return value of the query
   */
  onSuccess?: (data: FunctionReturnType<Query>) => void;

  /**
   * Callback invoked when the query fails.
   * @param err - The error that occurred
   */
  onError?: (err: Error) => void;
}

/**
 * The result of calling injectQuery.
 */
export interface QueryResult<Query extends QueryReference> {
  /**
   * The current data from the query subscription.
   * Undefined until cached data or the first successful result is available.
   * Data is also undefined when the query is skipped.
   * Changing to a new uncached query identity clears the previous value.
   * Refetching the same identity preserves the current value while reloading.
   */
  data: Signal<FunctionReturnType<Query> | undefined>;

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

  /**
   * True when data has been successfully received.
   * False during loading, when skipped, or when there's an error.
   */
  isSuccess: Signal<boolean>;

  /**
   * The current status of the query.
   * - 'pending': Loading initial data or resubscribing
   * - 'success': Data received successfully
   * - 'error': Query failed with an error
   * - 'skipped': Query is skipped via skipToken
   */
  status: Signal<QueryStatus>;

  /**
   * Force the query to refetch by resubscribing.
   * Existing data is preserved while the same query identity refetches.
   */
  refetch: () => void;
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
 * // With callbacks
 * const todos = injectQuery(
 *   api.todos.list,
 *   () => ({}),
 *   {
 *     onSuccess: (data) => console.log('Loaded', data.length, 'todos'),
 *     onError: (err) => console.error('Failed to load todos', err),
 *   }
 * );
 *
 * // In template:
 * // @switch (todos.status()) {
 * //   @case ('pending') { <span>Loading...</span> }
 * //   @case ('skipped') { <span>Select a user</span> }
 * //   @case ('error') { <span>Error: {{ todos.error()?.message }}</span> }
 * //   @case ('success') {
 * //     @for (todo of todos.data(); track todo._id) {
 * //       <div>{{ todo.title }}</div>
 * //     }
 * //   }
 * // }
 * ```
 *
 * @param query - A FunctionReference to the query function
 * @param argsFn - A reactive function returning the query arguments, or skipToken to skip the query
 * @param options - Optional callbacks for success and error handling
 * @returns A QueryResult with reactive data, error, loading, and skipped signals
 */
export function injectQuery<Query extends QueryReference>(
  query: Query,
  argsFn: () => Query['_args'] | SkipToken,
  options?: QueryOptions<Query>,
): QueryResult<Query> {
  return runInResolvedInjectionContext(injectQuery, options?.injectRef, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);
    const queryName = getFunctionName(query);

    const initialArgs = argsFn();
    const initialCachedData =
      initialArgs === skipToken ? undefined : convex.client.localQueryResult(queryName, initialArgs);

    // Initialize signals
    const data = signal<FunctionReturnType<Query> | undefined>(initialCachedData);
    const error = signal<Error | undefined>(undefined);
    const isLoading = signal(initialArgs !== skipToken && initialCachedData === undefined);
    const isSkipped = signal(initialArgs === skipToken);

    // Version counter for manual refetch
    const refetchVersion = signal(0);

    let previousArgsKey: string | undefined =
      initialArgs === skipToken ? undefined : serializeArgs(initialArgs as Record<string, Value>);

    // Computed signals
    const isSuccess = computed(() => !isLoading() && !isSkipped() && !error() && data() !== undefined);
    const status = computed<QueryStatus>(() => {
      if (isSkipped()) return 'skipped';
      if (isLoading()) return 'pending';
      if (error()) return 'error';
      return 'success';
    });

    const subscription = createSubscriptionController<{
      args: Query['_args'];
      argsKey: string;
      isRefetch: boolean;
    }>(destroyRef, {
      onSkip: () => {
        data.set(undefined);
        error.set(undefined);
        isLoading.set(false);
        isSkipped.set(true);
      },
      onPending: ({ args, isRefetch }) => {
        isSkipped.set(false);
        error.set(undefined);

        const cachedData = convex.client.localQueryResult(queryName, args);
        if (cachedData !== undefined) {
          data.set(cachedData);
          isLoading.set(isRefetch);
        } else if (isRefetch) {
          isLoading.set(true);
        } else {
          data.set(undefined);
          isLoading.set(true);
        }
      },
      subscribe: ({ args }, controls) =>
        convex.onUpdate(
          query,
          args,
          (result: FunctionReturnType<Query>) => {
            if (!controls.isCurrent()) {
              return;
            }

            data.set(result);
            error.set(undefined);
            isLoading.set(false);
            options?.onSuccess?.(result);
          },
          (err: Error) => {
            if (!controls.isCurrent()) {
              return;
            }

            // Preserve existing data on error for better UX
            error.set(err);
            isLoading.set(false);
            options?.onError?.(err);
          },
        ),
    });

    // Effect to reactively subscribe when args change
    effect(() => {
      const args = argsFn();
      const version = refetchVersion();

      if (args === skipToken) {
        previousArgsKey = undefined;
        subscription.sync(skipToken);
        return;
      }

      const argsKey = serializeArgs(args as Record<string, Value>);
      const isRefetch = previousArgsKey === argsKey && version > 0;
      previousArgsKey = argsKey;
      subscription.sync({
        identity: `${argsKey}:${version}`,
        value: {
          args,
          argsKey,
          isRefetch,
        },
      });
    });

    // Refetch function
    const refetch = () => {
      refetchVersion.update((v) => v + 1);
    };

    return {
      data: data.asReadonly(),
      error: error.asReadonly(),
      isLoading: isLoading.asReadonly(),
      isSkipped: isSkipped.asReadonly(),
      isSuccess,
      status,
      refetch,
    };
  });
}
