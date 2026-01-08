import {
  DestroyRef,
  Signal,
  assertInInjectionContext,
  effect,
  inject,
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
import { injectConvex } from './inject-convex';

/**
 * Pagination status returned by the Convex client.
 * @internal
 */
type PaginationStatus =
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
  status: PaginationStatus;
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
export interface PaginatedQueryOptions {
  /**
   * Number of items to load initially.
   */
  initialNumItems: number;
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
 * // In template:
 * // @if (todos.isSkipped()) {
 * //   <span>Select a category</span>
 * // } @else {
 * //   @for (todo of todos.results(); track todo._id) { ... }
 * //   <button (click)="todos.loadMore(10)" [disabled]="!todos.canLoadMore()">
 * //     Load More
 * //   </button>
 * // }
 * ```
 *
 * @param query - A FunctionReference to the paginated query function
 * @param argsFn - A function returning the arguments object for the query (excluding paginationOpts), or skipToken to skip
 * @param optionsFn - A function returning the pagination options including initialNumItems
 * @returns A PaginatedQueryResult with signals for results, status, and methods for loadMore/reset
 */
export function injectPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  argsFn: () => PaginatedQueryArgs<Query> | SkipToken,
  optionsFn: () => PaginatedQueryOptions,
): PaginatedQueryResult<Query> {
  assertInInjectionContext(injectPaginatedQuery);
  const convex = injectConvex();
  const destroyRef = inject(DestroyRef);

  // Internal signals
  const results = signal<PaginatedQueryItem<Query>[]>([]);
  const error = signal<Error | undefined>(undefined);
  const isLoadingFirstPage = signal(true);
  const isLoadingMore = signal(false);
  const canLoadMore = signal(false);
  const isExhausted = signal(false);
  const isSkipped = signal(false);

  // Track the loadMore function from the current subscription
  let currentLoadMore: ((numItems: number) => boolean) | undefined;
  let unsubscribe: (() => void) | undefined;

  // Version counter to trigger reset
  const resetVersion = signal(0);

  const subscribe = (args: PaginatedQueryArgs<Query>) => {
    unsubscribe?.();

    const options = optionsFn();

    // Reset state for new subscription
    results.set([]);
    error.set(undefined);
    isLoadingFirstPage.set(true);
    isLoadingMore.set(false);
    canLoadMore.set(false);
    isExhausted.set(false);
    isSkipped.set(false);
    currentLoadMore = undefined;

    unsubscribe = convex.onPaginatedUpdate_experimental(
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
      },
      (err: Error) => {
        // Keep existing results on error
        error.set(err);
        isLoadingFirstPage.set(false);
        isLoadingMore.set(false);
        // Allow retry via loadMore
        canLoadMore.set(true);
        isExhausted.set(false);
      },
    );
  };

  // Effect to reactively subscribe when args or options change
  effect(() => {
    // Track dependencies
    const args = argsFn();
    optionsFn();
    resetVersion();

    // Cleanup previous subscription
    unsubscribe?.();

    // If skipToken, reset state and don't subscribe
    if (args === skipToken) {
      results.set([]);
      error.set(undefined);
      isLoadingFirstPage.set(false);
      isLoadingMore.set(false);
      canLoadMore.set(false);
      isExhausted.set(false);
      isSkipped.set(true);
      currentLoadMore = undefined;
      return;
    }

    subscribe(args);
  });

  destroyRef.onDestroy(() => unsubscribe?.());

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
    loadMore,
    reset,
  };
}
