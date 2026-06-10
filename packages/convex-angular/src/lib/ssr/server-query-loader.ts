import { Injectable, PendingTasks, TransferState, inject } from '@angular/core';
import { FunctionArgs, FunctionReference, FunctionReturnType, getFunctionName } from 'convex/server';
import { Value } from 'convex/values';

import { makeQueryStateKey, wrapQueryResult } from './state-transfer';
import { CONVEX_HTTP_CLIENT, CONVEX_SSR_CONFIG } from './tokens';

/**
 * Runs one-shot query fetches over HTTP during server-side rendering.
 *
 * Each fetch runs inside Angular's PendingTasks so SSR serialization waits
 * for the data, and successful results are written into TransferState for
 * the browser to seed from after hydration. Fetches are deduplicated per
 * query + args pair so multiple consumers share one request (and one
 * consistent error).
 *
 * @internal
 */
@Injectable()
export class ConvexServerQueryLoader {
  private readonly config = inject(CONVEX_SSR_CONFIG);
  private readonly httpClient = inject(CONVEX_HTTP_CLIENT);
  private readonly transferState = inject(TransferState);
  private readonly pendingTasks = inject(PendingTasks);

  // Lives for one server render: Angular SSR bootstraps a fresh application
  // (and injector, and loader) per request, so entries never leak across
  // requests. Entries are intentionally kept after settling — every consumer
  // of a query during the render shares one result (or one error).
  private readonly inflight = new Map<string, Promise<Value | undefined>>();
  private authApplied: Promise<void> | undefined;

  /**
   * Whether server-side fetching is enabled (`ssr.fetchOnServer !== false`).
   */
  get enabled(): boolean {
    return this.config.ssr.fetchOnServer !== false;
  }

  /**
   * Fetch a query once over HTTP, transferring the result to the browser.
   * Concurrent calls for the same query + args share one request.
   */
  fetch<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
    argsKey: string,
  ): Promise<FunctionReturnType<Query>> {
    const queryName = getFunctionName(query);
    const cacheKey = `${queryName}:${argsKey}`;

    const existing = this.inflight.get(cacheKey);
    if (existing) {
      return existing as Promise<FunctionReturnType<Query>>;
    }

    // PendingTasks.run() returns void and routes errors to the ErrorHandler,
    // so use add() to block stability while keeping the result promise.
    const removeTask = this.pendingTasks.add();
    const fetchPromise = (async () => {
      try {
        await this.applyAuth();
        const result = await this.httpClient.query(query, args);
        this.transferState.set(makeQueryStateKey(queryName, argsKey), wrapQueryResult(result));
        return result;
      } finally {
        removeTask();
      }
    })();

    this.inflight.set(cacheKey, fetchPromise);
    // Mark the cached promise as handled so a rejection without a second
    // consumer never surfaces as an unhandled rejection during SSR.
    fetchPromise.catch(() => undefined);
    return fetchPromise as Promise<FunctionReturnType<Query>>;
  }

  private applyAuth(): Promise<void> {
    this.authApplied ??= (async () => {
      const token = await this.config.ssr.authToken?.();
      if (token) {
        this.httpClient.setAuth(token);
      }
    })();
    return this.authApplied;
  }
}
