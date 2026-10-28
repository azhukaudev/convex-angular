import { AuthTokenFetcher, ConnectionState, ConvexClient, PaginationStatus } from 'convex/browser';
import { FunctionArgs, PaginationOptions } from 'convex/server';
import { Value } from 'convex/values';

import type {
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryReference,
} from '../providers/inject-paginated-query';

/**
 * The result from a paginated query subscription callback. This matches the
 * actual runtime type from `ConvexClient.onPaginatedUpdate_experimental`,
 * whose declared callback type does not match the runtime shape.
 *
 * @internal
 */
export interface ClientPaginatedResult<T> {
  results: T[];
  status: PaginationStatus;
  loadMore: (numItems: number) => boolean;
}

/**
 * BaseConvexClient.setAuth — `ConvexClient.setAuth` is 2-arg and drops
 * `onRefreshChange`, but the `isRefreshing`/`'refreshing'` auth feature
 * needs it, so this reaches through `convex.client` (`BaseConvexClient`)
 * directly.
 *
 * @internal
 */
export function setAuthWithRefresh(
  convex: ConvexClient,
  fetchToken: AuthTokenFetcher,
  onChange: (isAuthenticated: boolean) => void,
  onRefreshChange: (isRefreshing: boolean) => void,
): void {
  convex.client.setAuth(fetchToken, onChange, onRefreshChange);
}

/**
 * BaseConvexClient.hasAuth — not exposed on the `ConvexClient` facade.
 *
 * @internal
 */
export function hasAuth(convex: ConvexClient): boolean {
  return convex.client.hasAuth();
}

/**
 * BaseConvexClient.clearAuth — not exposed on the `ConvexClient` facade.
 *
 * @internal
 */
export function clearAuth(convex: ConvexClient): void {
  convex.client.clearAuth();
}

/**
 * BaseConvexClient.localQueryResult — the synchronous warm-cache read used to
 * resolve a query's initial data before its live subscription emits. Not
 * exposed on the `ConvexClient` facade.
 *
 * @internal
 */
export function localQueryResult(
  convex: ConvexClient,
  queryName: string,
  args: Record<string, Value>,
): Value | undefined {
  return convex.client.localQueryResult(queryName, args);
}

type ExperimentalPaginatedSubscriptionClient = {
  onPaginatedUpdate_experimental: ConvexClient['onPaginatedUpdate_experimental'];
};

function getPaginatedSubscriptionClient(convex: ConvexClient): ExperimentalPaginatedSubscriptionClient {
  const paginatedClient = convex as ConvexClient & Partial<ExperimentalPaginatedSubscriptionClient>;

  if (typeof paginatedClient.onPaginatedUpdate_experimental !== 'function') {
    throw new Error(
      '[convex-angular] `injectPaginatedQuery()` requires a Convex client with experimental paginated query support.',
    );
  }

  return paginatedClient as ExperimentalPaginatedSubscriptionClient;
}

/**
 * ConvexClient.onPaginatedUpdate_experimental — a name-marked-experimental
 * API with a runtime feature probe, since not every client build supports
 * paginated subscriptions.
 *
 * @internal
 */
export function subscribeToPaginatedQuery<Query extends PaginatedQueryReference>(
  convex: ConvexClient,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  initialNumItems: number,
  onUpdate: (result: ClientPaginatedResult<PaginatedQueryItem<Query>>) => void,
  onError: (err: Error) => void,
): () => void {
  const paginatedClient = getPaginatedSubscriptionClient(convex);

  return paginatedClient.onPaginatedUpdate_experimental(
    query,
    args as FunctionArgs<Query>,
    { initialNumItems },
    (rawResult) => {
      onUpdate(rawResult as unknown as ClientPaginatedResult<PaginatedQueryItem<Query>>);
    },
    onError,
  );
}

/**
 * `paginationOpts.id` — an undeclared field the client injects onto
 * `PaginationOptions` at runtime, used as the grouping key for
 * `insertAtPosition`. Not part of the documented `PaginationOptions` type.
 *
 * The client injects a number, and `ConvexClient` always injects `-1`
 * (`simple_client.ts`), so every subscription made through `ConvexClient`
 * shares one group.
 *
 * @internal
 */
export function paginationOptsId(value: PaginationOptions): number {
  return (value as PaginationOptions & { id: number }).id;
}

/**
 * The static `ConnectionState` reported while the Convex client is disabled
 * (server-side rendering): no connection exists and the real client's
 * connection-state accessors throw, so there is no live value to mirror.
 *
 * @internal
 */
// Frozen: this single instance is shared by every disabled consumer.
export const DISABLED_CONNECTION_STATE: ConnectionState = Object.freeze({
  hasInflightRequests: false,
  isWebSocketConnected: false,
  timeOfOldestInflightRequest: null,
  hasEverConnected: false,
  connectionCount: 0,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
});
