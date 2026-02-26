import {
  Signal,
  assertInInjectionContext,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';

import { SkipToken, skipToken } from '../skip-token';
import { PaginatedQueryStatus } from '../types';
import { injectConvex } from './inject-convex';

/**
 * Pagination status returned by the Convex client.
 * @internal
 */
type ClientPaginationStatus =
  | 'LoadingFirstPage'
  | 'CanLoadMore'
  | 'LoadingMore'
  | 'Exhausted';

/**
 * The result from a paginated query subscription callback.
 * This matches the actual runtime type from ConvexClient.onPaginatedUpdate_experimental.
 * @internal
 */
interface ClientPaginatedResult<T> {
  results: T[];
  status: ClientPaginationStatus;
  loadMore: (numItems: number) => boolean;
}

/**
 * A FunctionReference that is usable with injectPaginatedQuery.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type PaginationOptions
 * - Have a return type of PaginationResult
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<any>
>;

/**
 * Given a PaginatedQueryReference, get the type of the arguments
 * object for the query, excluding the paginationOpts argument.
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>;

/**
 * Given a PaginatedQueryReference, get the type of the item being paginated over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number];

/**
 * Options for injectPaginatedQuery.
 */
export interface PaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /**
   * Number of items to load initially.
   */
  initialNumItems: number;

  /**
   * Callback invoked when the query receives data.
   * Called on initial load and every subsequent update.
   * @param results - The accumulated results from all pages
   */
  onSuccess?: (results: PaginatedQueryItem<Query>[]) => void;

  /**
   * Callback invoked when the query fails.
   * @param err - The error that occurred
   */
  onError?: (err: Error) => void;
}

/**
 * The result of calling injectPaginatedQuery.
 */
export interface PaginatedQueryResult<Query extends PaginatedQueryReference> {
  /**
   * The accumulated results from all loaded pages.
   */
  results: Signal<PaginatedQueryItem<Query>[]>;

  /**
   * The current error, if any. Preserved when loadMore fails.
   */
  error: Signal<Error | undefined>;

  /**
   * True when loading the first page of results.
   */
  isLoadingFirstPage: Signal<boolean>;

  /**
   * True when loading additional pages of results.
   */
  isLoadingMore: Signal<boolean>;

  /**
   * True when more items can be loaded.
   */
  canLoadMore: Signal<boolean>;

  /**
   * True when all items have been loaded.
   */
  isExhausted: Signal<boolean>;

  /**
   * True when the query is skipped via skipToken.
   * When skipped, results is empty and no subscription is active.
   */
  isSkipped: Signal<boolean>;

  /**
   * True when first page has been successfully loaded.
   * False during loading, when skipped, or when there's an error.
   */
  isSuccess: Signal<boolean>;

  /**
   * True when the query has an error.
   * False during loading, when skipped, or when data is received successfully.
   */
  isError: Signal<boolean>;

  /**
   * The current status of the paginated query.
   * - 'pending': Loading the first page
   * - 'success': First page loaded successfully (may still load more)
   * - 'error': Query failed with an error
   * - 'skipped': Query is skipped via skipToken
   */
  status: Signal<PaginatedQueryStatus>;

  /**
   * Load more items.
   * @param numItems - Number of items to load
   * @returns true if loading was initiated, false if already loading or exhausted
   */
  loadMore: (numItems: number) => boolean;

  /**
   * Reset the pagination and reload from the beginning.
   */
  reset: () => void;
}

/**
 * Load data reactively from a paginated query to create a growing list.
 *
 * This can be used to power "infinite scroll" UIs.
 *
 * @example
 * ```typescript
 * const todos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => ({ category: 'work' }),
 *   () => ({ initialNumItems: 10 })
 * );
 *
 * // Conditionally skipped query using skipToken
 * const category = signal<string | null>(null);
 * const filteredTodos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => category() ? { category: category() } : skipToken,
 *   () => ({ initialNumItems: 10 })
 * );
 *
 * // With callbacks
 * const todos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => ({}),
 *   () => ({
 *     initialNumItems: 10,
 *     onSuccess: (results) => console.log('Loaded', results.length, 'items'),
 *     onError: (err) => console.error('Failed to load', err),
 *   })
 * );
 *
 * // In template:
 * // @switch (todos.status()) {
 * //   @case ('pending') { <span>Loading...</span> }
 * //   @case ('skipped') { <span>Select a category</span> }
 * //   @case ('error') { <span>Error: {{ todos.error()?.message }}</span> }
 * //   @case ('success') {
 * //     @for (todo of todos.results(); track todo._id) { ... }
 * //     <button (click)="todos.loadMore(10)" [disabled]="!todos.canLoadMore()">
 * //       Load More
 * //     </button>
 * //   }
 * // }
 * ```
 *
 * @param query - A FunctionReference to the paginated query function
 * @param argsFn - A function returning the arguments object for the query (excluding paginationOpts), or skipToken to skip
 * @param optionsFn - A function returning the pagination options including initialNumItems and optional callbacks
 * @returns A PaginatedQueryResult with signals for results, status, and methods for loadMore/reset
 */
export function injectPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  argsFn: () => PaginatedQueryArgs<Query> | SkipToken,
  optionsFn: () => PaginatedQueryOptions<Query>,
): PaginatedQueryResult<Query> {
  assertInInjectionContext(injectPaginatedQuery);
  const convex = injectConvex();

  // Internal signals
  const results = signal<PaginatedQueryItem<Query>[]>([]);
  const error = signal<Error | undefined>(undefined);
  const isLoadingFirstPage = signal(true);
  const isLoadingMore = signal(false);
  const canLoadMore = signal(false);
  const isExhausted = signal(false);
  const isSkipped = signal(false);

  // Computed signals
  const isSuccess = computed(
    () => !isLoadingFirstPage() && !isSkipped() && !error(),
  );
  const isError = computed(() => error() !== undefined);
  const status = computed<PaginatedQueryStatus>(() => {
    if (isSkipped()) return 'skipped';
    if (isLoadingFirstPage()) return 'pending';
    if (error()) return 'error';
    return 'success';
  });

  // Track the loadMore function from the current subscription
  let currentLoadMore: ((numItems: number) => boolean) | undefined;

  // Version counter to trigger reset
  const resetVersion = signal(0);

  /**
   * Reset all state to initial values.
   */
  const resetState = () => {
    results.set([]);
    error.set(undefined);
    isLoadingFirstPage.set(true);
    isLoadingMore.set(false);
    canLoadMore.set(false);
    isExhausted.set(false);
    isSkipped.set(false);
    currentLoadMore = undefined;
  };

  // Effect to reactively subscribe when args or options change
  effect((onCleanup) => {
    // Track dependencies
    const args = argsFn();
    const options = optionsFn();
    resetVersion();

    // If skipToken, reset state and don't subscribe
    if (args === skipToken) {
      resetState();
      isLoadingFirstPage.set(false);
      isSkipped.set(true);
      return;
    }

    // Reset state for new subscription
    resetState();

    const unsub = convex.onPaginatedUpdate_experimental(
      query,
      args as FunctionArgs<Query>,
      { initialNumItems: options.initialNumItems },
      (rawResult) => {
        // Cast to the actual runtime type (Convex types don't match implementation)
        const result = rawResult as unknown as ClientPaginatedResult<
          PaginatedQueryItem<Query>
        >;

        // Store the loadMore function
        currentLoadMore = result.loadMore;

        // Update results
        results.set(result.results);
        error.set(undefined);

        // Update status signals based on status
        switch (result.status) {
          case 'LoadingFirstPage':
            isLoadingFirstPage.set(true);
            isLoadingMore.set(false);
            canLoadMore.set(false);
            isExhausted.set(false);
            break;
          case 'LoadingMore':
            isLoadingFirstPage.set(false);
            isLoadingMore.set(true);
            canLoadMore.set(false);
            isExhausted.set(false);
            break;
          case 'CanLoadMore':
            isLoadingFirstPage.set(false);
            isLoadingMore.set(false);
            canLoadMore.set(true);
            isExhausted.set(false);
            break;
          case 'Exhausted':
            isLoadingFirstPage.set(false);
            isLoadingMore.set(false);
            canLoadMore.set(false);
            isExhausted.set(true);
            break;
        }

        // Call success callback (not during LoadingFirstPage as we don't have complete results yet)
        if (result.status !== 'LoadingFirstPage') {
          options.onSuccess?.(result.results);
        }
      },
      (err: Error) => {
        // Keep existing results on error
        error.set(err);
        isLoadingFirstPage.set(false);
        isLoadingMore.set(false);
        // Allow retry via loadMore
        canLoadMore.set(true);
        isExhausted.set(false);
        options.onError?.(err);
      },
    );

    onCleanup(() => unsub());
  });

  const loadMore = (numItems: number): boolean => {
    if (!currentLoadMore) {
      return false;
    }
    return currentLoadMore(numItems);
  };

  const reset = () => {
    resetVersion.update((v) => v + 1);
  };

  return {
    results: results.asReadonly(),
    error: error.asReadonly(),
    isLoadingFirstPage: isLoadingFirstPage.asReadonly(),
    isLoadingMore: isLoadingMore.asReadonly(),
    canLoadMore: canLoadMore.asReadonly(),
    isExhausted: isExhausted.asReadonly(),
    isSkipped: isSkipped.asReadonly(),
    isSuccess,
    isError,
    status,
    loadMore,
    reset,
  };
}
