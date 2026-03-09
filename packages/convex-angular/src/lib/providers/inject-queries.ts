import { DestroyRef, EnvironmentInjector, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { FunctionReturnType, getFunctionName } from 'convex/server';
import { Value, convexToJson } from 'convex/values';

import { SkipToken, skipToken } from '../skip-token';
import { QueryStatus } from '../types';
import { injectConvex } from './inject-convex';
import { QueryReference } from './inject-query';
import { runInResolvedInjectionContext } from './injection-context';

/**
 * A keyed query request used by injectQueries.
 */
export interface QueryRequest<Query extends QueryReference = QueryReference> {
  query: Query;
  args: Query['_args'];
}

/**
 * A keyed definition map used by injectQueries.
 */
export type QueriesDefinition = Record<string, QueryRequest<any> | SkipToken>;

type QueryData<Request> = Request extends QueryRequest<infer Query> ? FunctionReturnType<Query> | undefined : undefined;

type QueryResultsRecord<Definitions extends QueriesDefinition> = {
  [Key in keyof Definitions]: QueryData<Definitions[Key]>;
};

type QueryErrorsRecord<Definitions extends QueriesDefinition> = {
  [Key in keyof Definitions]: Error | undefined;
};

type QueryStatusesRecord<Definitions extends QueriesDefinition> = {
  [Key in keyof Definitions]: QueryStatus;
};

interface ActiveQuerySubscription {
  key: string;
  queryName: string;
  argsKey: string;
  unsubscribe: () => void;
}

/**
 * Options for injectQueries.
 */
export interface QueriesOptions {
  /**
   * Environment injector used to create the queries outside the current
   * injection context.
   */
  injectRef?: EnvironmentInjector;
}

/**
 * The result of calling injectQueries.
 */
export interface QueriesResult<Definitions extends QueriesDefinition> {
  /**
   * The latest result for each active key.
   * Keys using skipToken are present with undefined values.
   * Keys removed from the definition are removed from this record.
   */
  results: Signal<QueryResultsRecord<Definitions>>;

  /**
   * The latest error for each key.
   * Keys using skipToken are present with undefined values.
   * Keys removed from the definition are removed from this record.
   */
  errors: Signal<QueryErrorsRecord<Definitions>>;

  /**
   * The latest status for each key.
   * Keys using skipToken are present with a status of skipped.
   * Keys removed from the definition are removed from this record.
   */
  statuses: Signal<QueryStatusesRecord<Definitions>>;

  /**
   * True while at least one active query is waiting for its first result.
   */
  isLoading: Signal<boolean>;
}

function serializeArgs(args: Record<string, Value>): string {
  return JSON.stringify(convexToJson(args));
}

function cloneWithoutKey<T extends Record<string, unknown>>(source: T, key: string): T {
  if (!(key in source)) {
    return source;
  }

  const next = { ...source };
  delete next[key];
  return next;
}

function setKey<T extends Record<string, unknown>>(source: T, key: string, value: unknown): T {
  return {
    ...source,
    [key]: value,
  };
}

/**
 * Subscribe to multiple Convex queries reactively.
 *
 * This is useful when the set of queries is dynamic or when multiple reactive
 * queries should be managed together with keyed signals.
 *
 * @example
 * ```typescript
 * const queries = injectQueries(() => ({
 *   user: userId() ? { query: api.users.get, args: { userId: userId() } } : skipToken,
 *   todos: { query: api.todos.list, args: { count: 10 } },
 * }));
 *
 * // In template:
 * // @if (queries.statuses().user === 'success') {
 * //   <div>{{ queries.results().user?.name }}</div>
 * // }
 * // @for (todo of queries.results().todos ?? []; track todo._id) {
 * //   <div>{{ todo.title }}</div>
 * // }
 * ```
 *
 * @param definitionsFn - A reactive function returning keyed query definitions or skipToken values
 * @param options - Optional configuration including injectRef
 * @returns Keyed signals for query results, errors, statuses, and aggregate loading state
 */
export function injectQueries<Definitions extends QueriesDefinition>(
  definitionsFn: () => Definitions,
  options?: QueriesOptions,
): QueriesResult<Definitions> {
  return runInResolvedInjectionContext(injectQueries, options?.injectRef, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);

    const results = signal<Record<string, unknown>>({});
    const errors = signal<Record<string, Error | undefined>>({});
    const statuses = signal<Record<string, QueryStatus>>({});
    const activeSubscriptions = new Map<string, ActiveQuerySubscription>();

    const cleanupSubscription = (key: string) => {
      const activeSubscription = activeSubscriptions.get(key);
      if (!activeSubscription) {
        return;
      }

      activeSubscriptions.delete(key);
      activeSubscription.unsubscribe();
    };

    const removeKey = (key: string) => {
      cleanupSubscription(key);
      results.update((current) => cloneWithoutKey(current, key));
      errors.update((current) => cloneWithoutKey(current, key));
      statuses.update((current) => cloneWithoutKey(current, key));
    };

    const cleanupAll = () => {
      for (const key of Array.from(activeSubscriptions.keys())) {
        cleanupSubscription(key);
      }
    };

    effect(() => {
      const definitions = definitionsFn();
      const nextKeys = new Set(Object.keys(definitions));

      for (const key of Array.from(activeSubscriptions.keys())) {
        if (!nextKeys.has(key)) {
          removeKey(key);
        }
      }

      for (const key of Object.keys(definitions)) {
        const definition = definitions[key];

        if (definition === skipToken) {
          cleanupSubscription(key);
          results.update((current) => setKey(current, key, undefined));
          errors.update((current) => setKey(current, key, undefined));
          statuses.update((current) => setKey(current, key, 'skipped'));
          continue;
        }

        const queryName = getFunctionName(definition.query);
        const argsKey = serializeArgs(definition.args as Record<string, Value>);
        const activeSubscription = activeSubscriptions.get(key);
        const isSameSubscription =
          activeSubscription?.queryName === queryName && activeSubscription.argsKey === argsKey;

        if (isSameSubscription) {
          continue;
        }

        cleanupSubscription(key);
        errors.update((current) => setKey(current, key, undefined));
        statuses.update((current) => setKey(current, key, 'pending'));

        if (!(key in untracked(results))) {
          results.update((current) => setKey(current, key, undefined));
        }

        const cachedResult = convex.client.localQueryResult(queryName, definition.args) as
          | FunctionReturnType<typeof definition.query>
          | undefined;

        if (cachedResult !== undefined) {
          results.update((current) => setKey(current, key, cachedResult));
        }

        const subscription: ActiveQuerySubscription = {
          key,
          queryName,
          argsKey,
          unsubscribe: () => {},
        };

        const unsubscribe = convex.onUpdate(
          definition.query,
          definition.args,
          (result) => {
            if (activeSubscriptions.get(key) !== subscription) {
              return;
            }

            results.update((current) => setKey(current, key, result));
            errors.update((current) => setKey(current, key, undefined));
            statuses.update((current) => setKey(current, key, 'success'));
          },
          (error) => {
            if (activeSubscriptions.get(key) !== subscription) {
              return;
            }

            errors.update((current) => setKey(current, key, error));
            statuses.update((current) => setKey(current, key, 'error'));
          },
        );

        subscription.unsubscribe = unsubscribe;
        activeSubscriptions.set(key, subscription);
      }
    });

    destroyRef.onDestroy(() => cleanupAll());

    const isLoading = computed(() => Object.values(statuses()).some((status) => status === 'pending'));

    return {
      results: results.asReadonly() as Signal<QueryResultsRecord<Definitions>>,
      errors: errors.asReadonly() as Signal<QueryErrorsRecord<Definitions>>,
      statuses: statuses.asReadonly() as Signal<QueryStatusesRecord<Definitions>>,
      isLoading,
    };
  });
}
