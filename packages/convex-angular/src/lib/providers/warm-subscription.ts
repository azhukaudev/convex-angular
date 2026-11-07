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
  /**
   * Release the subscription after `ms`. Arms once; a no-op after release.
   * `ms` is capped at 2_147_483_647 (the largest delay a timer supports).
   */
  releaseAfter(ms: number): void;
}

// The largest delay setTimeout supports (2^31 - 1 ms, about 24.8 days). Larger
// delays, Infinity included, overflow and fire after ~0 ms.
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Subscribe to a query and keep the subscription warm until it is released.
 *
 * `handlers.onValue` and `handlers.onError` are forwarded synchronously from
 * the client's listener dispatch, except for a failed subscribe (below).
 * `handlers.onRelease` runs once, after the subscription has been dropped,
 * whichever path released it.
 *
 * `destroyRef` must not be destroyed: callers check `destroyRef.destroyed`
 * first, and a destroyed scope throws (NG0911 for a view, NG0205 for an
 * injector) before anything is subscribed.
 *
 * If the client throws while subscribing (for example on args that are not
 * Convex values), nothing is subscribed and the destroy hook is removed. The
 * error is forwarded to `handlers.onError` on the next microtask — never
 * inline, so the caller holds the returned handle first — wrapped in an
 * `Error` if it was not one. The returned handle is inert and
 * `handlers.onRelease` does not run.
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

  // Hook first: a destroyed scope throws here, before anything is subscribed.
  const removeDestroyHook = destroyRef.onDestroy(release);
  let unsubscribe: () => void;
  try {
    unsubscribe = convex.onUpdate(query, args, handlers.onValue, handlers.onError);
  } catch (error) {
    // The client throws before it registers anything. Mark the handle released so it does nothing, because
    // `release` would otherwise call the unassigned `unsubscribe`. Drop the destroy hook so a long-lived injector
    // does not keep this closure alive. Report on a microtask so callers hold the handle before `onError` runs.
    released = true;
    removeDestroyHook();
    queueMicrotask(() => handlers.onError(error instanceof Error ? error : new Error(String(error))));
  }

  return {
    release,
    releaseAfter: (ms) => {
      if (released || timeoutId !== undefined) {
        return;
      }
      timeoutId = setTimeout(release, Math.min(ms, MAX_TIMER_DELAY));
    },
  };
}
