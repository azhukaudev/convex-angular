import { DestroyRef, EnvironmentInjector, Signal, computed, effect, inject, isSignal, signal } from '@angular/core';
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { ConvexError, Value, compareValues } from 'convex/values';

import { PaginatedQueryStatus } from '../types';
import { SkipToken, skipToken } from '../skip-token';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';
import { createSubscriptionController, serializeArgs } from './query-subscription-lifecycle';

type QueryPageKey = number;
type ClientPaginationOptions = PaginationOptions & { id: number };

interface PaginatedSessionTarget<Query extends PaginatedQueryReference> {
  args: PaginatedQueryArgs<Query>;
  initialNumItems: number;
  sessionId: number;
}

interface PageSubscriptionState<Query extends PaginatedQueryReference> {
  args: FunctionArgs<Query>;
  error?: Error;
  result?: FunctionReturnType<Query>;
  unsubscribe?: () => void;
}

interface SessionSummary<Query extends PaginatedQueryReference> {
  results: PaginatedQueryItem<Query>[];
  error?: Error;
  isLoadingFirstPage: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  isExhausted: boolean;
  loadMoreCursor?: string;
}

function isInvalidCursorPaginationError(error: Error): boolean {
  return (
    error.message.includes('InvalidCursor') ||
    (error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data?.isConvexSystemError === true &&
      error.data?.paginationError === 'InvalidCursor')
  );
}

function shouldSplitResult<Result extends PaginationResult<any>>(result: Result, initialNumItems: number): boolean {
  return (
    !!result.splitCursor &&
    (result.pageStatus === 'SplitRecommended' ||
      result.pageStatus === 'SplitRequired' ||
      result.page.length > initialNumItems * 2)
  );
}

function buildPaginationOptions(
  numItems: number,
  cursor: string | null,
  id: number,
  endCursor?: string,
): ClientPaginationOptions {
  return endCursor === undefined ? { numItems, cursor, id } : { numItems, cursor, endCursor, id };
}

function buildPageArgs<Query extends PaginatedQueryReference>(
  args: PaginatedQueryArgs<Query>,
  paginationOpts: ClientPaginationOptions,
): FunctionArgs<Query> {
  return { ...args, paginationOpts } as FunctionArgs<Query>;
}

function readPaginationOptions<Query extends PaginatedQueryReference>(
  page: PageSubscriptionState<Query>,
): ClientPaginationOptions {
  return (page.args as FunctionArgs<Query> & { paginationOpts: ClientPaginationOptions }).paginationOpts;
}

let paginationSessionId = 0;

function nextPaginationSessionId(): number {
  paginationSessionId += 1;
  return paginationSessionId;
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
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<FunctionArgs<Query>, 'paginationOpts'>;

/**
 * Given a PaginatedQueryReference, get the type of the item being paginated over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> = FunctionReturnType<Query>['page'][number];

/**
 * Options for injectPaginatedQuery.
 */
export interface PaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /**
   * Environment injector used to create the paginated query outside the
   * current injection context.
   */
  injectRef?: EnvironmentInjector;

  /**
   * Number of items to load initially.
   */
  initialNumItems: number | Signal<number>;

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
   * True when actively loading (first page or additional pages).
   * Equivalent to isLoadingFirstPage() || isLoadingMore().
   */
  isLoading: Signal<boolean>;

  /**
   * The current status of the paginated query.
   *
   * React-parity states (lowercased per Angular conventions):
   * - 'loadingFirstPage': Loading the first page of results
   * - 'loadingMore': Loading additional pages after the first
   * - 'canLoadMore': First page loaded; more items can be fetched
   * - 'exhausted': All items have been loaded
   *
   * Angular-only extensions:
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
 * Each active helper instance owns an isolated pagination session. When the
 * arguments, `initialNumItems`, or `reset()` change, the helper starts a fresh
 * session from the first page.
 *
 * @example
 * ```typescript
 * const todos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => ({ category: 'work' }),
 *   { initialNumItems: 10 }
 * );
 *
 * // Conditionally skipped query using skipToken
 * const category = signal<string | null>(null);
 * const filteredTodos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => category() ? { category: category() } : skipToken,
 *   { initialNumItems: 10 }
 * );
 *
 * // Reactive page size
 * const pageSize = signal(10);
 * const paginatedTodos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => ({}),
 *   { initialNumItems: pageSize }
 * );
 *
 * // With callbacks
 * const todos = injectPaginatedQuery(
 *   api.todos.listTodos,
 *   () => ({}),
 *   {
 *     initialNumItems: 10,
 *     onSuccess: (results) => console.log('Loaded', results.length, 'items'),
 *     onError: (err) => console.error('Failed to load', err),
 *   }
 * );
 *
 * // In template:
 * // @switch (todos.status()) {
 * //   @case ('loadingFirstPage') { <span>Loading first page...</span> }
 * //   @case ('loadingMore') { <span>Loading more...</span> }
 * //   @case ('exhausted') { <span>All items loaded</span> }
 * //   @case ('canLoadMore') {
 * //     @for (todo of todos.results(); track todo._id) { ... }
 * //     <button (click)="todos.loadMore(10)" [disabled]="!todos.canLoadMore()">
 * //       Load More
 * //     </button>
 * //   }
 * //   @case ('error') { <span>Error: {{ todos.error()?.message }}</span> }
 * //   @case ('skipped') { <span>Select a category</span> }
 * // }
 * ```
 *
 * @param query - A FunctionReference to the paginated query function
 * @param argsFn - A function returning the arguments object for the query (excluding paginationOpts), or skipToken to skip
 * @param options - Pagination options including initialNumItems and optional callbacks
 * @returns A PaginatedQueryResult with signals for results, status, and methods for loadMore/reset
 */
export function injectPaginatedQuery<Query extends PaginatedQueryReference>(
  query: Query,
  argsFn: () => PaginatedQueryArgs<Query> | SkipToken,
  options: PaginatedQueryOptions<Query>,
): PaginatedQueryResult<Query> {
  return runInResolvedInjectionContext(injectPaginatedQuery, options.injectRef, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);

    const results = signal<PaginatedQueryItem<Query>[]>([]);
    const error = signal<Error | undefined>(undefined);
    const isLoadingFirstPage = signal(true);
    const isLoadingMore = signal(false);
    const canLoadMore = signal(false);
    const isExhausted = signal(false);
    const isSkipped = signal(false);

    const isSuccess = computed(() => !isLoadingFirstPage() && !isSkipped() && !error());
    const isLoading = computed(() => isLoadingFirstPage() || isLoadingMore());
    const status = computed<PaginatedQueryStatus>(() => {
      if (isSkipped()) return 'skipped';
      if (error()) return 'error';
      if (isLoadingFirstPage()) return 'loadingFirstPage';
      if (isLoadingMore()) return 'loadingMore';
      if (isExhausted()) return 'exhausted';
      return 'canLoadMore';
    });

    let currentLoadMore: ((numItems: number) => boolean) | undefined;
    const resetVersion = signal(0);
    let lastEmittedSuccessResults: PaginatedQueryItem<Query>[] | undefined;

    const applySummary = (summary: SessionSummary<Query>, emitSuccess: boolean) => {
      results.set(summary.results);
      error.set(summary.error);
      isSkipped.set(false);
      isLoadingFirstPage.set(summary.isLoadingFirstPage);
      isLoadingMore.set(summary.isLoadingMore);
      canLoadMore.set(summary.canLoadMore);
      isExhausted.set(summary.isExhausted);
      currentLoadMore = summary.canLoadMore ? currentLoadMore : undefined;

      if (emitSuccess && !summary.error && !summary.isLoadingFirstPage && !summary.isLoadingMore) {
        const logicalResultsChanged =
          lastEmittedSuccessResults === undefined ||
          compareValues(summary.results as Value, lastEmittedSuccessResults as Value) !== 0;

        if (logicalResultsChanged) {
          lastEmittedSuccessResults = summary.results;
          options.onSuccess?.(summary.results);
        }
      }
    };

    const subscription = createSubscriptionController<PaginatedSessionTarget<Query>>(destroyRef, {
      onSkip: () => {
        results.set([]);
        error.set(undefined);
        isLoadingFirstPage.set(false);
        isLoadingMore.set(false);
        canLoadMore.set(false);
        isExhausted.set(false);
        isSkipped.set(true);
        currentLoadMore = undefined;
        lastEmittedSuccessResults = undefined;
      },
      onPending: () => {
        results.set([]);
        error.set(undefined);
        isLoadingFirstPage.set(true);
        isLoadingMore.set(false);
        canLoadMore.set(false);
        isExhausted.set(false);
        isSkipped.set(false);
        currentLoadMore = undefined;
        lastEmittedSuccessResults = undefined;
      },
      subscribe: ({ args, initialNumItems, sessionId }, controls) => {
        let disposed = false;
        let nextPageKey = 1;
        let pageKeys: QueryPageKey[] = [0];
        const pages = new Map<QueryPageKey, PageSubscriptionState<Query>>();
        const ongoingSplits = new Map<QueryPageKey, [QueryPageKey, QueryPageKey]>();
        let restartScheduled = false;

        const removePage = (key: QueryPageKey) => {
          const page = pages.get(key);
          page?.unsubscribe?.();
          pages.delete(key);
        };

        const startPageSubscription = (key: QueryPageKey, paginationOpts: ClientPaginationOptions) => {
          const page: PageSubscriptionState<Query> = {
            args: buildPageArgs(args, paginationOpts),
          };
          pages.set(key, page);

          page.unsubscribe = convex.onUpdate(
            query,
            page.args,
            (result: FunctionReturnType<Query>) => {
              if (!controls.isCurrent() || disposed) {
                return;
              }

              page.result = result;
              page.error = undefined;

              if (!ongoingSplits.has(key) && shouldSplitResult(result, initialNumItems)) {
                const splitCursor = result.splitCursor;
                if (splitCursor) {
                  const currentPaginationOpts = readPaginationOptions(page);
                  const leftKey = nextPageKey;
                  const rightKey = nextPageKey + 1;
                  nextPageKey += 2;
                  ongoingSplits.set(key, [leftKey, rightKey]);
                  startPageSubscription(leftKey, {
                    ...currentPaginationOpts,
                    endCursor: splitCursor,
                  });
                  startPageSubscription(rightKey, {
                    ...currentPaginationOpts,
                    cursor: splitCursor,
                    endCursor: result.continueCursor,
                  });
                }
              }

              recompute(true);
            },
            (err: Error) => {
              if (!controls.isCurrent() || disposed) {
                return;
              }

              if (isInvalidCursorPaginationError(err)) {
                if (!restartScheduled) {
                  restartScheduled = true;
                  resetVersion.update((version) => version + 1);
                }
                return;
              }

              page.error = err;
              options.onError?.(err);
              recompute(false);
            },
          ) as unknown as () => void;
        };

        const completeSplit = (key: QueryPageKey, splitKeys: [QueryPageKey, QueryPageKey]) => {
          const pageIndex = pageKeys.indexOf(key);
          if (pageIndex >= 0) {
            pageKeys = [...pageKeys.slice(0, pageIndex), ...splitKeys, ...pageKeys.slice(pageIndex + 1)];
          }
          ongoingSplits.delete(key);
          removePage(key);
        };

        const summarize = (): SessionSummary<Query> => {
          let aggregatedResults: PaginatedQueryItem<Query>[] = [];
          let blockingError: Error | undefined;
          let blockingErrorKey: QueryPageKey | undefined;
          let splitError: Error | undefined;
          let lastSuccessfulResult: FunctionReturnType<Query> | undefined;
          let encounteredPendingPage = false;
          let splitRequiredPending = false;

          for (const key of pageKeys) {
            const ongoingSplit = ongoingSplits.get(key);
            if (ongoingSplit) {
              const [leftKey, rightKey] = ongoingSplit;
              const leftPage = pages.get(leftKey);
              const rightPage = pages.get(rightKey);

              if (leftPage?.result !== undefined && rightPage?.result !== undefined) {
                completeSplit(key, ongoingSplit);
                return summarize();
              }

              splitError ??= leftPage?.error ?? rightPage?.error;
            }

            const page = pages.get(key);
            if (!page) {
              encounteredPendingPage = true;
              break;
            }

            if (page.error) {
              blockingError = page.error;
              blockingErrorKey = key;
              break;
            }

            if (page.result === undefined) {
              encounteredPendingPage = true;
              break;
            }

            if (page.result.pageStatus === 'SplitRequired') {
              splitRequiredPending = true;
              break;
            }

            aggregatedResults = [...aggregatedResults, ...page.result.page];
            lastSuccessfulResult = page.result;
          }

          const activeError = blockingError ?? splitError;
          if (activeError) {
            return {
              results: aggregatedResults,
              error: activeError,
              isLoadingFirstPage: false,
              isLoadingMore: false,
              canLoadMore: false,
              isExhausted: false,
            };
          }

          if (encounteredPendingPage || splitRequiredPending || lastSuccessfulResult === undefined) {
            const hasUsableFirstPage = lastSuccessfulResult !== undefined;
            return {
              results: aggregatedResults,
              isLoadingFirstPage: !hasUsableFirstPage,
              isLoadingMore: hasUsableFirstPage,
              canLoadMore: false,
              isExhausted: false,
            };
          }

          if (lastSuccessfulResult.isDone) {
            return {
              results: aggregatedResults,
              isLoadingFirstPage: false,
              isLoadingMore: false,
              canLoadMore: false,
              isExhausted: true,
            };
          }

          return {
            results: aggregatedResults,
            isLoadingFirstPage: false,
            isLoadingMore: false,
            canLoadMore: true,
            isExhausted: false,
            loadMoreCursor: lastSuccessfulResult.continueCursor,
          };
        };

        const recompute = (emitSuccess: boolean) => {
          if (!controls.isCurrent() || disposed) {
            return;
          }

          const summary = summarize();
          currentLoadMore = summary.canLoadMore
            ? (numItems: number) => {
                if (!controls.isCurrent() || disposed) {
                  return false;
                }

                if (summary.isLoadingFirstPage || summary.isLoadingMore || !summary.loadMoreCursor) {
                  return false;
                }

                const key = nextPageKey;
                nextPageKey += 1;
                pageKeys = [...pageKeys, key];
                startPageSubscription(key, buildPaginationOptions(numItems, summary.loadMoreCursor, sessionId));
                recompute(false);
                return true;
              }
            : undefined;

          applySummary(summary, emitSuccess);
        };

        startPageSubscription(0, buildPaginationOptions(initialNumItems, null, sessionId));
        recompute(false);

        return () => {
          disposed = true;
          currentLoadMore = undefined;
          for (const key of pages.keys()) {
            removePage(key);
          }
        };
      },
    });

    effect(() => {
      const args = argsFn();
      const initialNumItems = isSignal(options.initialNumItems) ? options.initialNumItems() : options.initialNumItems;
      const version = resetVersion();

      if (args === skipToken) {
        subscription.sync(skipToken);
        return;
      }

      const argsKey = serializeArgs(args as Record<string, Value>);
      subscription.sync({
        identity: `${argsKey}:${initialNumItems}:${version}`,
        value: {
          args,
          initialNumItems,
          sessionId: nextPaginationSessionId(),
        },
      });
    });

    const loadMore = (numItems: number): boolean => {
      if (!currentLoadMore) {
        return false;
      }
      return currentLoadMore(numItems);
    };

    const reset = () => {
      resetVersion.update((version) => version + 1);
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
      isLoading,
      status,
      loadMore,
      reset,
    };
  });
}
