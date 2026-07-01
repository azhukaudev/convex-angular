import { DestroyRef, EnvironmentInjector, inject } from '@angular/core';
import { FunctionReference } from 'convex/server';

import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

const DEFAULT_EXTEND_SUBSCRIPTION_FOR = 5_000;

/**
 * A FunctionReference that refers to a Convex query.
 */
export type PrewarmQueryReference = FunctionReference<'query'>;

/**
 * Options for injectPrewarmQuery.
 */
export interface PrewarmQueryOptions<Query extends PrewarmQueryReference> {
  /**
   * Environment injector used to resolve dependencies when creating the helper
   * outside the current injection context.
   */
  injectRef?: EnvironmentInjector;

  /**
   * How long to keep the background subscription alive after prewarming.
   * Defaults to 5000ms.
   */
  extendSubscriptionFor?: number;

  /**
   * Callback invoked when the background subscription fails.
   */
  onError?: (err: Error, args: Query['_args']) => void;
}

/**
 * The result of calling injectPrewarmQuery.
 */
export interface PrewarmQueryResult<Query extends PrewarmQueryReference> {
  /**
   * Start a temporary subscription to warm the local Convex query cache.
   *
   * Resolves true once the warm subscription receives its first result — a
   * later `injectQuery(...)` for the same query and args will read the warm
   * cache. Resolves false when the subscription fails, when it expires
   * (`extendSubscriptionFor`) or the owning scope is destroyed before a
   * result arrives, and during server-side rendering where prewarming is a
   * no-op. The return value can be ignored for fire-and-forget prewarming.
   */
  prewarm: (args: Query['_args']) => Promise<boolean>;
}

interface ActivePrewarm {
  dispose: () => void;
}

/**
 * Create a helper that prewarms a Convex query for upcoming navigation or UI work.
 *
 * This starts a short-lived background subscription so a later `injectQuery(...)`
 * call can often read a warm local result immediately.
 *
 * @example
 * ```typescript
 * const prewarmProfile = injectPrewarmQuery(api.users.getProfile);
 *
 * openProfile(userId: string) {
 *   prewarmProfile.prewarm({ userId });
 *   void this.router.navigate(['/users', userId]);
 * }
 * ```
 */
export function injectPrewarmQuery<Query extends PrewarmQueryReference>(
  query: Query,
  options?: PrewarmQueryOptions<Query>,
): PrewarmQueryResult<Query> {
  return runInResolvedInjectionContext(injectPrewarmQuery, options?.injectRef, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);
    const activePrewarms = new Set<ActivePrewarm>();

    const cleanupAll = () => {
      for (const activePrewarm of Array.from(activePrewarms)) {
        activePrewarm.dispose();
      }
    };

    destroyRef.onDestroy(() => cleanupAll());

    const prewarm = (args: Query['_args']): Promise<boolean> => {
      // On a disabled client (server-side rendering) subscriptions are
      // no-ops and the cleanup timer would only delay SSR stability.
      if (convex.disabled) {
        return Promise.resolve(false);
      }

      const extendSubscriptionFor = options?.extendSubscriptionFor ?? DEFAULT_EXTEND_SUBSCRIPTION_FOR;

      let disposed = false;
      // The promise resolves at the first settleWarmed call; the later calls
      // on the error and dispose paths are no-ops.
      let settleWarmed: (warmed: boolean) => void;
      const warmed = new Promise<boolean>((resolve) => {
        settleWarmed = resolve;
      });

      // Reassigned once onUpdate returns; captured by dispose so the error
      // callback can release a failed subscription immediately instead of
      // waiting for the expiry timer. onUpdate only reports errors
      // asynchronously (off the socket), so dispose never runs before
      // `timeoutId` below is initialized.
      let unsubscribe = () => {};

      const entry: ActivePrewarm = {
        dispose: () => {
          if (disposed) {
            return;
          }

          disposed = true;
          activePrewarms.delete(entry);
          clearTimeout(timeoutId);
          unsubscribe();
          settleWarmed(false);
        },
      };

      unsubscribe = convex.onUpdate(
        query,
        args,
        () => settleWarmed(true),
        (err: Error) => {
          settleWarmed(false);
          options?.onError?.(err, args);
          entry.dispose();
        },
      );

      activePrewarms.add(entry);
      const timeoutId = setTimeout(() => entry.dispose(), extendSubscriptionFor);

      return warmed;
    };

    return { prewarm };
  });
}
