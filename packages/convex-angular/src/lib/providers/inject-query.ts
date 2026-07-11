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
 * Placeholder data for a query: a plain value, or a factory called with the
 * current args returning the value (or undefined for no placeholder).
 *
 * @public
 */
export type QueryPlaceholderData<Query extends QueryReference> =
  | FunctionReturnType<Query>
  | ((args: Query['_args']) => FunctionReturnType<Query> | undefined);

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
   * that only seeds the pending state — warm-cache values, data seeded from
   * the server render during hydration, or `placeholderData` — the first
   * live update after the WebSocket syncs fires it instead.
   * @param data - The return value of the query
   */
  onSuccess?: (data: FunctionReturnType<Query>) => void;

  /**
   * Callback invoked when the query fails.
   * @param err - The error that occurred
   */
  onError?: (err: Error) => void;

  /**
   * Value shown in `data` while the first result for the current args loads,
   * or a factory called with the current args (useful to seed a detail view
   * from a list item already on hand; return undefined for no placeholder).
   *
   * Placeholder data never marks the query successful: `status` stays
   * 'pending', `isPlaceholderData()` is true, and `onSuccess` does not fire.
   * It is also cleared when the query errors, so invented data is never
   * shown next to an error state. Real local data wins — the placeholder is
   * not used when a warm-cache, server-transferred, or preserved previous
   * value is available. Factories run untracked: reading signals inside one
   * does not retrigger the subscription.
   */
  placeholderData?: QueryPlaceholderData<Query>;
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
   * Also true while resubscribing after an args change or `refetch()`.
   */
  isLoading: Signal<boolean>;

  /**
   * True while resubscribing (after an args change or `refetch()`) with a
   * previous value still shown in `data`, and when a new subscription starts
   * from a warm-cache value and is waiting for the live result to confirm it.
   * False during the initial load (no data yet) and while placeholder data
   * is shown — use it to render a "refreshing" affordance instead of a
   * full skeleton.
   */
  isRefetching: Signal<boolean>;

  /**
   * True while `data` is showing `placeholderData` instead of a real query
   * result. Cleared as soon as a real value arrives (live result, warm
   * cache, or server-transferred data) and when the query errors.
   */
  isPlaceholderData: Signal<boolean>;

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
    const isPlaceholderData = signal(false);

    // Version counter for manual refetch
    const refetchVersion = signal(0);

    // Computed signals
    const isSuccess = computed(() => !isLoading() && !isSkipped() && !error());
    const isRefetching = computed(() => isLoading() && !isPlaceholderData() && data() !== undefined);
    const status = computed<QueryStatus>(() => {
      if (isSkipped()) return 'skipped';
      if (isLoading()) return 'pending';
      if (error()) return 'error';
      return 'success';
    });

    // Track current subscription for cleanup
    let unsubscribe: (() => void) | undefined;
    let activeGeneration = 0;
    // Remembers the last subscription's identity (refetch version + args) so
    // an equivalent-args re-run of the effect below can be skipped instead of
    // tearing down and re-opening the live subscription.
    let lastSubscriptionKey: string | undefined;
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
      const currentRefetchVersion = refetchVersion(); // Track for manual refetch

      // If skipToken, reset state and don't subscribe
      if (args === skipToken) {
        lastSubscriptionKey = undefined;
        const generation = activeGeneration + 1;
        activeGeneration = generation;
        cleanupSubscription();
        data.set(undefined);
        error.set(undefined);
        isLoading.set(false);
        isSkipped.set(true);
        isPlaceholderData.set(false);
        return;
      }

      const argsKey = serializeQueryArgs(args);
      const subscriptionKey = `${currentRefetchVersion}:${argsKey}`;
      if (subscriptionKey === lastSubscriptionKey) {
        // Reactive inputs changed but the query identity didn't: keep the
        // live subscription instead of tearing it down and re-opening it.
        return;
      }
      lastSubscriptionKey = subscriptionKey;

      const generation = activeGeneration + 1;
      activeGeneration = generation;

      // Cleanup previous subscription
      cleanupSubscription();

      // Not skipped - try to get cached data and start subscription
      isSkipped.set(false);
      isLoading.set(true);
      // A placeholder never carries across runs: it is re-derived for the
      // current args below when still needed.
      const wasPlaceholder = untracked(isPlaceholderData);
      isPlaceholderData.set(false);

      const settle = (result: FunctionReturnType<Query>) => {
        if (generation !== activeGeneration) {
          return;
        }

        data.set(result);
        error.set(undefined);
        isLoading.set(false);
        isPlaceholderData.set(false);
        options?.onSuccess?.(result);
      };
      const fail = (err: Error) => {
        if (generation !== activeGeneration) {
          return;
        }

        // Preserve existing real data on error for better UX — but never a
        // placeholder: invented data next to an error state would mislead.
        if (untracked(isPlaceholderData)) {
          data.set(undefined);
          isPlaceholderData.set(false);
        }
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
      // immediately; otherwise preserve the previous real value during the
      // pending resubscribe, or show the placeholder when nothing local is
      // available.
      const initial = readInitialQueryData(convex, hydration, getFunctionName(query), args, argsKey);
      if (initial?.kind === 'cache') {
        data.set(initial.value as FunctionReturnType<Query>);
      } else if (initial?.kind === 'transferred') {
        // Match the server-rendered HTML: report success immediately. The
        // live subscription below replaces the value once it syncs.
        data.set(initial.value as FunctionReturnType<Query> | undefined);
        error.set(undefined);
        isLoading.set(false);
      } else if (untracked(data) === undefined || wasPlaceholder) {
        // Nothing local and no real previous value to preserve: show the
        // placeholder (re-evaluated for the current args) or clear a stale
        // one. Untracked so signals read inside a placeholder factory don't
        // retrigger this subscription effect.
        const placeholder = untracked(() => resolvePlaceholderData(options?.placeholderData, args));
        data.set(placeholder);
        isPlaceholderData.set(placeholder !== undefined);
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
      isRefetching,
      isPlaceholderData: isPlaceholderData.asReadonly(),
      isSkipped: isSkipped.asReadonly(),
      isSuccess,
      status,
      refetch,
    };
  });
}

// Convex values are never functions, so a function-typed placeholder is
// unambiguously a factory.
function resolvePlaceholderData<Query extends QueryReference>(
  placeholderData: QueryPlaceholderData<Query> | undefined,
  args: Query['_args'],
): FunctionReturnType<Query> | undefined {
  if (typeof placeholderData === 'function') {
    return (placeholderData as (args: Query['_args']) => FunctionReturnType<Query> | undefined)(args);
  }
  return placeholderData;
}
