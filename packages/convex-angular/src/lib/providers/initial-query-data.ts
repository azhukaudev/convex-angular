import { ConvexClient } from 'convex/browser';
import { Value } from 'convex/values';

import { localQueryResult } from '../internal/convex-client-internals';
import { ConvexHydrationState } from '../ssr/state-transfer';

/**
 * Data available for a query before its live subscription emits, with its
 * origin. A warm client-cache hit is a prefill (the query stays pending until
 * the subscription delivers it — the client replays a warm-cache value on the
 * next macrotask); a transferred server-render result is settled
 * (the helper reports success immediately so the hydrated UI matches the
 * server HTML).
 *
 * @internal
 */
export type InitialQueryData = { kind: 'cache' | 'transferred'; value: Value | undefined } | undefined;

/**
 * Resolve the initial data for a query + args pair: the warm client cache
 * first, then data transferred from the server render. Encodes that
 * precedence in one place for all query helpers.
 *
 * @internal
 */
export function readInitialQueryData(
  convex: ConvexClient,
  hydration: ConvexHydrationState | null,
  queryName: string,
  args: Record<string, Value>,
  argsKey: string,
): InitialQueryData {
  let cached: Value | undefined;
  try {
    cached = localQueryResult(convex, queryName, args);
  } catch {
    // The client throws for an error-valued cache entry; treat it as a miss — the client replays
    // the cached error to the new listener on the next macrotask, so the subscription surfaces it.
    return undefined;
  }
  if (cached !== undefined) {
    return { kind: 'cache', value: cached };
  }

  const transferred = hydration?.consume(queryName, argsKey);
  if (transferred !== undefined) {
    return { kind: 'transferred', value: transferred.value };
  }

  return undefined;
}
