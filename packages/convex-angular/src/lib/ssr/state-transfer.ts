import { ApplicationRef, Injectable, StateKey, TransferState, inject, makeStateKey } from '@angular/core';
import { JSONValue, Value, convexToJson, jsonToConvex } from 'convex/values';

/**
 * Serialized form of a query result stored in Angular's TransferState.
 * `d` holds a defined result encoded with convexToJson; `u` marks an
 * undefined result so it can be distinguished from a missing entry.
 *
 * @internal
 */
export type TransferredQueryResult = { d: JSONValue } | { u: true };

/**
 * Serialize query args into a stable cache key.
 *
 * Accepts any Convex function args object: args are serializable Convex
 * values by construction, so the single cast to the convexToJson input type
 * lives here instead of at every call site.
 *
 * @internal
 */
export function serializeQueryArgs(args: object): string {
  return JSON.stringify(convexToJson(args as Value));
}

/**
 * Build the TransferState key for a query + args pair.
 *
 * @internal
 */
export function makeQueryStateKey(queryName: string, argsKey: string): StateKey<TransferredQueryResult> {
  return makeStateKey<TransferredQueryResult>(`cva:${queryName}:${argsKey}`);
}

/**
 * Wrap a query result for storage in TransferState.
 *
 * @internal
 */
export function wrapQueryResult(value: Value | undefined): TransferredQueryResult {
  if (value === undefined) {
    return { u: true };
  }
  return { d: convexToJson(value) };
}

/**
 * Restore a query result from its TransferState representation.
 *
 * @internal
 */
export function unwrapQueryResult(transferred: TransferredQueryResult): Value | undefined {
  return 'd' in transferred ? jsonToConvex(transferred.d) : undefined;
}

/**
 * Browser-side access to query results transferred from the server render.
 *
 * Seeding is only active during the bootstrap/hydration window: once the
 * application becomes stable the live WebSocket subscription is the source
 * of truth and transferred entries are ignored (mirroring the semantics of
 * Angular's HttpClient transfer cache). Entries are not deleted on consume
 * so multiple components mounting the same query at bootstrap all seed.
 *
 * @internal
 */
@Injectable()
export class ConvexHydrationState {
  private readonly transferState = inject(TransferState);
  private active = true;

  constructor() {
    const appRef = inject(ApplicationRef);
    void appRef.whenStable().then(() => {
      this.active = false;
    });
  }

  /**
   * Read the transferred result for a query + args pair, if one exists and
   * the hydration window is still open.
   *
   * @returns an object holding the value (which may itself be undefined),
   * or undefined when there is nothing to seed.
   */
  consume(queryName: string, argsKey: string): { value: Value | undefined } | undefined {
    if (!this.active) {
      return undefined;
    }

    const key = makeQueryStateKey(queryName, argsKey);
    if (!this.transferState.hasKey(key)) {
      return undefined;
    }

    const transferred = this.transferState.get(key, null);
    if (transferred === null) {
      return undefined;
    }

    return { value: unwrapQueryResult(transferred) };
  }
}
