import { DestroyRef } from '@angular/core';
import { ConvexClient } from 'convex/browser';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

/**
 * A Convex subscription that is released exactly once: on `release()`, when a
 * `releaseAfter(ms)` timer fires, or when `destroyRef` is destroyed —
 * whichever comes first. The destroy hook is removed on release, because
 * callers such as route resolvers run in a long-lived injector that would
 * otherwise pin the subscription's closure (and any resolved value) for the
 * whole session.
 *
 * @internal
 */
export interface WarmSubscription {
  /** Release the subscription now. Later calls do nothing. */
  release(): void;
  /** Release the subscription after `ms`. Arms once; a no-op after release. */
  releaseAfter(ms: number): void;
}

/**
 * Subscribe to a query and keep the subscription warm until it is released.
 *
 * `handlers.onValue` and `handlers.onError` are forwarded synchronously from
 * the client's listener dispatch. `handlers.onRelease` runs once, after the
 * subscription has been dropped, whichever path released it.
 *
 * @internal
 */
export function openWarmSubscription<Query extends FunctionReference<'query'>>(
  convex: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
  destroyRef: DestroyRef,
  handlers: {
    onValue: (value: FunctionReturnType<Query>) => void;
    onError: (err: Error) => void;
    onRelease: () => void;
  },
): WarmSubscription {
  let released = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    removeDestroyHook();
    clearTimeout(timeoutId);
    unsubscribe();
    handlers.onRelease();
  };

  const unsubscribe = convex.onUpdate(query, args, handlers.onValue, handlers.onError);
  const removeDestroyHook = destroyRef.onDestroy(release);

  return {
    release,
    releaseAfter: (ms) => {
      if (released || timeoutId !== undefined) {
        return;
      }
      timeoutId = setTimeout(release, ms);
    },
  };
}
