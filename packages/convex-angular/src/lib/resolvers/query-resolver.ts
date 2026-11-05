import { isPlatformServer } from '@angular/common';
import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, RouterStateSnapshot } from '@angular/router';
import { FunctionArgs, FunctionReturnType } from 'convex/server';

import { QueryReference } from '../providers/inject-query';
import { openWarmSubscription } from '../providers/warm-subscription';
import { SkipToken, skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { serializeQueryArgs } from '../ssr/state-transfer';
import { CONVEX } from '../tokens/convex';

const DEFAULT_KEEP_SUBSCRIBED_FOR = 5_000;

/**
 * Options for {@link convexQueryResolver}.
 *
 * @public
 */
export interface ConvexQueryResolverOptions {
  /**
   * How long to keep the resolver's subscription alive after the route
   * resolves, so the component's own `injectQuery(...)` deduplicates onto the
   * warm subscription and renders instantly. Defaults to 5000ms.
   */
  keepSubscribedFor?: number;
}

/**
 * Create an Angular route resolver that blocks navigation until the first
 * result of a Convex query is available locally.
 *
 * This is the explicit-preloading counterpart to `injectQuery`: by the time
 * the routed component is created, its `injectQuery(...)` for the same query
 * and args reads the warm local cache and renders without a loading state —
 * the equivalent of React's `preloadQuery`/`usePreloadedQuery` flow.
 *
 * Failures never block navigation: subscription errors (and server-side fetch
 * failures) resolve `undefined`, and the component's own `injectQuery`
 * surfaces the error reactively.
 *
 * During server-side rendering the query is fetched over HTTP and transferred
 * to the browser, exactly like `injectQuery`'s SSR behavior.
 *
 * @example
 * ```typescript
 * // app.routes.ts
 * export const routes: Routes = [
 *   {
 *     path: 'users/:id',
 *     component: UserProfileComponent,
 *     resolve: {
 *       profile: convexQueryResolver(api.users.getProfile, (route) => ({
 *         userId: route.paramMap.get('id')!,
 *       })),
 *     },
 *   },
 * ];
 *
 * // user-profile.component.ts — renders instantly from the warm cache
 * readonly profile = injectQuery(api.users.getProfile, () => ({
 *   userId: this.route.snapshot.paramMap.get('id')!,
 * }));
 * ```
 *
 * @param query - A FunctionReference to the query function
 * @param argsFn - Maps the route snapshot to query args, or skipToken to skip. Defaults to no args.
 * @param options - Optional resolver configuration
 * @returns A ResolveFn resolving with the first query result, or undefined when skipped or failed
 *
 * @public
 */
export function convexQueryResolver<Query extends QueryReference>(
  query: Query,
  argsFn?: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => FunctionArgs<Query> | SkipToken,
  options?: ConvexQueryResolverOptions,
): ResolveFn<FunctionReturnType<Query> | undefined> {
  return (route, state) => {
    const convex = inject(CONVEX);
    const destroyRef = inject(DestroyRef);

    const args = argsFn ? argsFn(route, state) : ({} as FunctionArgs<Query>);
    if (args === skipToken) {
      return undefined;
    }

    // Server-side rendering: fetch once over HTTP; the loader also transfers
    // the result so the hydrated client seeds from it.
    if (isPlatformServer(inject(PLATFORM_ID))) {
      const serverLoader = inject(ConvexServerQueryLoader, { optional: true });
      if (!serverLoader?.enabled) {
        return undefined;
      }
      return serverLoader.fetch(query, args, serializeQueryArgs(args)).catch(() => undefined) as Promise<
        FunctionReturnType<Query> | undefined
      >;
    }

    // A disabled client never emits; resolve immediately instead of hanging
    // the navigation.
    if (convex.disabled) {
      return undefined;
    }

    const keepSubscribedFor = options?.keepSubscribedFor ?? DEFAULT_KEEP_SUBSCRIBED_FOR;

    return new Promise<FunctionReturnType<Query> | undefined>((resolve) => {
      // Only the first outcome counts: `resolve` keeps the first value and
      // `releaseAfter` arms its timer once, so later calls change nothing.
      const settle = (value: FunctionReturnType<Query> | undefined) => {
        // Keep the subscription warm so the routed component's injectQuery
        // dedupes onto it before it is dropped.
        subscription.releaseAfter(keepSubscribedFor);
        resolve(value);
      };

      // The client never calls back synchronously from onUpdate, so
      // `subscription` is always assigned before the first `settle`.
      const subscription = openWarmSubscription(convex, query, args, destroyRef, {
        onValue: settle,
        onError: () => settle(undefined),
        // A scope destroyed before the first result must not hang the
        // navigation; resolving undefined matches the error path's contract.
        // Resolve directly: on an already-destroyed scope this runs inside
        // openWarmSubscription, before `subscription` is initialised, and the
        // keep-warm timer `settle` would arm is moot after a release anyway.
        onRelease: () => resolve(undefined),
      });
    });
  };
}
