import { isPlatformServer } from '@angular/common';
import {
  DestroyRef,
  EnvironmentInjector,
  PLATFORM_ID,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FunctionReference, FunctionReturnType, getFunctionName } from 'convex/server';

import { SkipToken, skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { ConvexHydrationState, serializeQueryArgs } from '../ssr/state-transfer';
import { QueryStatus } from '../types';
import { readInitialQueryData } from './initial-query-data';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

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
   * Called on initial load and every subsequent update, including the
   * one-shot fetch during server-side rendering. It is NOT called for data
   * seeded from the server render during hydration — the first live update
   * after the WebSocket syncs fires it instead.
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
   * The last successful value is preserved during refetch for better UX.
   */
  data: Signal<FunctionReturnType<Query> | undefined>;

  /**
   * The current error, if the query subscription failed.
   * Undefined when there is no error.
   *
   * Errors thrown by your Convex function via `ConvexError` carry a typed
   * payload — narrow with `error() instanceof ConvexError` to read `.data`.
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
    const isServer = isPlatformServer(inject(PLATFORM_ID));
    // Both services are registered by provideConvex(...); optional injection
    // keeps setups that only provide the CONVEX token working.
    const serverLoader = isServer ? inject(ConvexServerQueryLoader, { optional: true }) : null;
    const hydration = !isServer ? inject(ConvexHydrationState, { optional: true }) : null;

    // Initialize signals
    const data = signal<FunctionReturnType<Query> | undefined>(undefined);
    const error = signal<Error | undefined>(undefined);
    const isLoading = signal(false);
    const isSkipped = signal(false);

    // Version counter for manual refetch
    const refetchVersion = signal(0);

    // Computed signals
    const isSuccess = computed(() => !isLoading() && !isSkipped() && !error());
    const status = computed<QueryStatus>(() => {
      if (isSkipped()) return 'skipped';
      if (isLoading()) return 'pending';
      if (error()) return 'error';
      return 'success';
    });

    // Track current subscription for cleanup
    let unsubscribe: (() => void) | undefined;
    let activeGeneration = 0;
    let previousArgsKey: string | undefined;
    const cleanupSubscription = () => {
      const currentUnsubscribe = unsubscribe;
      if (!currentUnsubscribe) {
        return;
      }
      unsubscribe = undefined;
      currentUnsubscribe();
    };

    // Effect to reactively subscribe when args change
    effect(() => {
      const args = argsFn();
      refetchVersion(); // Track for manual refetch
      const generation = activeGeneration + 1;
      activeGeneration = generation;

      // Cleanup previous subscription
      cleanupSubscription();

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
      const argsKey = serializeQueryArgs(args);
      const hasPreviousArgs = previousArgsKey !== undefined;
      previousArgsKey = argsKey;

      const settle = (result: FunctionReturnType<Query>) => {
        if (generation !== activeGeneration) {
          return;
        }

        data.set(result);
        error.set(undefined);
        isLoading.set(false);
        options?.onSuccess?.(result);
      };
      const fail = (err: Error) => {
        if (generation !== activeGeneration) {
          return;
        }

        // Preserve existing data on error for better UX
        error.set(err);
        isLoading.set(false);
        options?.onError?.(err);
      };

      // Server-side rendering: the WebSocket client is disabled, so the
      // query is a one-shot HTTP fetch that settles like a subscription
      // emission. The loader registers a pending task (SSR serialization
      // waits) and transfers the result to the browser.
      if (isServer) {
        if (serverLoader?.enabled) {
          serverLoader.fetch(query, args, argsKey).then(settle, fail);
        }
        return;
      }

      // Prefer the warm cache for the current args; fall back to data
      // transferred from the server render so a hydrated app shows content
      // immediately; otherwise preserve the previous value during the
      // pending resubscribe.
      const initial = readInitialQueryData(convex, hydration, getFunctionName(query), args, argsKey);
      if (initial?.kind === 'cache') {
        data.set(initial.value as FunctionReturnType<Query>);
      } else if (initial?.kind === 'transferred') {
        // Match the server-rendered HTML: report success immediately. The
        // live subscription below replaces the value once it syncs.
        data.set(initial.value as FunctionReturnType<Query> | undefined);
        error.set(undefined);
        isLoading.set(false);
      } else if (!hasPreviousArgs && untracked(data) !== undefined) {
        data.set(undefined);
      }

      // Subscribe to the query
      unsubscribe = convex.onUpdate(query, args, settle, fail);
    });

    // Cleanup subscription when the owning scope is destroyed
    destroyRef.onDestroy(() => {
      activeGeneration += 1;
      cleanupSubscription();
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
