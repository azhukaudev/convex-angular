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
   */
  prewarm: (args: Query['_args']) => void;
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

    const prewarm = (args: Query['_args']) => {
      const extendSubscriptionFor = options?.extendSubscriptionFor ?? DEFAULT_EXTEND_SUBSCRIPTION_FOR;

      let disposed = false;

      const unsubscribe = convex.onUpdate(
        query,
        args,
        () => undefined,
        (err: Error) => {
          options?.onError?.(err, args);
        },
      );

      const activePrewarm: ActivePrewarm = {
        dispose: () => {
          if (disposed) {
            return;
          }

          disposed = true;
          activePrewarms.delete(activePrewarm);
          clearTimeout(timeoutId);
          unsubscribe();
        },
      };

      activePrewarms.add(activePrewarm);
      const timeoutId = setTimeout(() => activePrewarm.dispose(), extendSubscriptionFor);
    };

    return { prewarm };
  });
}
