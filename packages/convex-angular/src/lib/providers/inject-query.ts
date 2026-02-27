import {
  Signal,
  assertInInjectionContext,
  computed,
  effect,
  signal,
  untracked,
} from '@angular/core';
import {
  FunctionReference,
  FunctionReturnType,
  getFunctionName,
} from 'convex/server';

import { SkipToken, skipToken } from '../skip-token';
import { QueryStatus } from '../types';
import { injectConvex } from './inject-convex';

/**
 * A FunctionReference that refers to a Convex query.
 */
export type QueryReference = FunctionReference<'query'>;

/**
 * Options for injectQuery.
 */
export interface QueryOptions<
  Query extends QueryReference,
  TSelected = FunctionReturnType<Query>,
> {
  /**
   * Data to use as the initial value before the query loads.
   * Useful for providing placeholder data to avoid loading spinners
   * for known defaults (e.g. empty arrays, default configs).
   *
   * The query will still subscribe and update with real data once available.
   * While initialData is shown and the query is loading, `isLoading` remains
   * `true` and `status` is `'pending'`.
   */
  initialData?: FunctionReturnType<Query>;

  /**
   * Transform the query data before it reaches the `data` signal.
   * Useful for deriving values without a separate `computed()`.
   *
   * When provided, the `data` signal will contain the transformed type.
   *
   * @example
   * ```typescript
   * const titles = injectQuery(api.todos.list, () => ({}), {
   *   select: (todos) => todos.map(t => t.title),
   * });
   * // titles.data() is string[] | undefined
   * ```
   *
   * @param data - The raw query return value
   * @returns The transformed data
   */
  select?: (data: FunctionReturnType<Query>) => TSelected;

  /**
   * Reactive function controlling whether the query is active.
   * When `enabled` returns `false`, the query is skipped (same as `skipToken`).
   * When it returns `true`, the query subscribes normally.
   *
   * This is an ergonomic alternative to conditionally returning `skipToken`
   * from `argsFn`. Unlike `skipToken`, `enabled` keeps the args function simple.
   *
   * @example
   * ```typescript
   * const userId = signal<string | null>(null);
   * const user = injectQuery(
   *   api.users.get,
   *   () => ({ id: userId()! }),
   *   { enabled: () => !!userId() },
   * );
   * ```
   */
  enabled?: () => boolean;

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
export interface QueryResult<
  Query extends QueryReference,
  TData = FunctionReturnType<Query>,
> {
  /**
   * The current data from the query subscription.
   * Initially populated from local cache if available, then updated reactively.
   * Data is preserved during refetch for better UX.
   *
   * When a `select` function is provided, this contains the transformed data.
   */
  data: Signal<TData>;

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
   * True when the query has an error.
   * False during loading, when skipped, or when data is received successfully.
   */
  isError: Signal<boolean>;

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
   * Existing data is preserved during refetch for better UX.
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
 * // With select to transform data
 * const todoTitles = injectQuery(
 *   api.todos.list,
 *   () => ({}),
 *   { select: (todos) => todos.map(t => t.title) },
 * );
 * // todoTitles.data() is string[] | undefined
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
 * // With enabled option (ergonomic alternative to skipToken)
 * const userId = signal<string | null>(null);
 * const user = injectQuery(
 *   api.users.get,
 *   () => ({ id: userId()! }),
 *   { enabled: () => !!userId() },
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
 * @param options - Optional configuration including select, enabled, initialData, and callbacks
 * @returns A QueryResult with reactive data, error, loading, and skipped signals
 */
// Overload: with select
export function injectQuery<Query extends QueryReference, TSelected>(
  query: Query,
  argsFn: () => Query['_args'] | SkipToken,
  options: QueryOptions<Query, TSelected> & {
    select: (data: FunctionReturnType<Query>) => TSelected;
  },
): QueryResult<Query, TSelected | undefined>;

// Overload: without select
export function injectQuery<Query extends QueryReference>(
  query: Query,
  argsFn: () => Query['_args'] | SkipToken,
  options?: QueryOptions<Query>,
): QueryResult<Query>;

// Implementation
export function injectQuery<Query extends QueryReference, TSelected>(
  query: Query,
  argsFn: () => Query['_args'] | SkipToken,
  options?: QueryOptions<Query, TSelected>,
): QueryResult<Query, TSelected | undefined> | QueryResult<Query> {
  assertInInjectionContext(injectQuery);
  const convex = injectConvex();

  // Initialize signals
  const rawData = signal<FunctionReturnType<Query>>(
    options?.initialData !== undefined ? options.initialData : undefined,
  );
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(true);
  const isSkipped = signal(false);

  // Version counter for manual refetch
  const refetchVersion = signal(0);

  // Computed signals
  const isSuccess = computed(() => !isLoading() && !isSkipped() && !error());
  const isError = computed(() => error() !== undefined);
  const status = computed<QueryStatus>(() => {
    if (isSkipped()) return 'skipped';
    if (isLoading()) return 'pending';
    if (error()) return 'error';
    return 'success';
  });

  // Apply select transform if provided
  const selectFn = options?.select;
  const data = selectFn
    ? computed(() => {
        const raw = rawData();
        return raw !== undefined ? selectFn(raw) : undefined;
      })
    : rawData.asReadonly();

  // Effect to reactively subscribe when args change
  effect((onCleanup) => {
    const args = argsFn();
    refetchVersion(); // Track for manual refetch

    // Check enabled option (reactive — read inside effect for tracking)
    const isEnabled = options?.enabled ? options.enabled() : true;

    // If skipToken or disabled, reset state and don't subscribe
    if (args === skipToken || !isEnabled) {
      rawData.set(undefined);
      error.set(undefined);
      isLoading.set(false);
      isSkipped.set(true);
      return;
    }

    // Not skipped - try to get cached data and start subscription
    isSkipped.set(false);
    isLoading.set(true);
    // Note: We preserve existing data during refetch for better UX

    // Initialize with cached data if available (only if no existing data)
    // Use untracked to avoid creating a reactive dependency on data
    if (untracked(rawData) === undefined) {
      const cachedData = convex.client.localQueryResult(
        getFunctionName(query),
        args,
      );
      if (cachedData !== undefined) {
        rawData.set(cachedData);
      }
    }

    // Subscribe to the query
    const unsub = convex.onUpdate(
      query,
      args,
      (result: FunctionReturnType<Query>) => {
        rawData.set(result);
        error.set(undefined);
        isLoading.set(false);
        options?.onSuccess?.(result);
      },
      (err: Error) => {
        // Preserve existing data on error for better UX
        error.set(err);
        isLoading.set(false);
        options?.onError?.(err);
      },
    );

    onCleanup(() => unsub());
  });

  // Refetch function
  const refetch = () => {
    refetchVersion.update((v) => v + 1);
  };

  return {
    data,
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
    isSkipped: isSkipped.asReadonly(),
    isSuccess,
    isError,
    status,
    refetch,
  } as QueryResult<Query, TSelected | undefined> | QueryResult<Query>;
}
