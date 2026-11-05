import { DestroyRef, EnvironmentInjector, inject } from '@angular/core';
import { FunctionArgs, FunctionReference } from 'convex/server';

import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';
import { injectUserCallbacks } from './user-callback';
import { openWarmSubscription } from './warm-subscription';

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
   * Defaults to 5000ms. Values above 2_147_483_647 (about 24.8 days), including
   * `Infinity`, are capped to that limit; the subscription is still released
   * when the owning injector is destroyed.
   */
  extendSubscriptionFor?: number;

  /**
   * Callback invoked when the background subscription fails.
   */
  onError?: (err: Error, args: FunctionArgs<Query>) => void;
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
  prewarm: (args: FunctionArgs<Query>) => Promise<boolean>;
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
    const callbacks = injectUserCallbacks(options);
    const destroyRef = inject(DestroyRef);

    const prewarm = (args: FunctionArgs<Query>): Promise<boolean> => {
      // On a disabled client (server-side rendering) subscriptions are
      // no-ops and the cleanup timer would only delay SSR stability.
      if (convex.disabled) {
        return Promise.resolve(false);
      }

      const extendSubscriptionFor = options?.extendSubscriptionFor ?? DEFAULT_EXTEND_SUBSCRIPTION_FOR;

      // The promise resolves at the first settleWarmed call; the later calls
      // on the error and release paths are no-ops.
      let settleWarmed: (warmed: boolean) => void;
      const warmed = new Promise<boolean>((resolve) => {
        settleWarmed = resolve;
      });

      // The error callback releases a failed subscription immediately instead
      // of waiting for the expiry timer. onUpdate only reports errors
      // asynchronously (off the socket), so it never runs before
      // `subscription` is assigned.
      const subscription = openWarmSubscription(convex, query, args, destroyRef, {
        onValue: () => settleWarmed(true),
        onError: (err) => {
          settleWarmed(false);
          callbacks.onError(err, args);
          subscription.release();
        },
        onRelease: () => settleWarmed(false),
      });
      // Unlike the resolver, the window starts now rather than at the first result.
      subscription.releaseAfter(extendSubscriptionFor);

      return warmed;
    };

    return { prewarm };
  });
}
