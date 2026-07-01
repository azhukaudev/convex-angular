import { InjectionToken, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { injectAuth } from '../providers/inject-auth';
import { ConvexAuthState, ConvexAuthStatus } from '../tokens/auth';

/**
 * Configuration for auth guards.
 *
 * @public
 */
export interface ConvexAuthGuardConfig {
  /**
   * The route to redirect to when authentication is required but user is not authenticated.
   * @default '/login'
   */
  loginRoute?: string;

  /**
   * The route {@link convexUnauthGuard} redirects to when an already
   * authenticated user navigates to a guarded route (such as a login page).
   * @default '/'
   */
  authenticatedRoute?: string;
}

/**
 * Injection token for auth guard configuration.
 *
 * @example
 * ```typescript
 * providers: [
 *   {
 *     provide: CONVEX_AUTH_GUARD_CONFIG,
 *     useValue: {
 *       loginRoute: '/auth/signin',
 *     },
 *   },
 * ]
 * ```
 *
 * @public
 */
export const CONVEX_AUTH_GUARD_CONFIG = new InjectionToken<ConvexAuthGuardConfig>('CONVEX_AUTH_GUARD_CONFIG');

/**
 * Options for {@link createConvexAuthGuard}.
 *
 * @public
 */
export interface ConvexAuthGuardOptions {
  /**
   * Additional check run after authentication is confirmed, with the current
   * JWT and its decoded claims (from `injectAuth().getAuth()`). Return true
   * to allow navigation. Use it for role- or claim-based routes.
   *
   * While a rejected token is being refreshed the guard waits for the
   * refresh to settle before running `allow`, so the claims are never stale.
   */
  allow?: (auth: { token: string; claims: Record<string, unknown> }) => boolean;

  /**
   * Where to send authenticated users who fail the `allow` check.
   * When omitted, navigation is blocked without a redirect.
   */
  forbiddenRoute?: string;

  /**
   * Per-guard override of the login route. Falls back to
   * {@link CONVEX_AUTH_GUARD_CONFIG}, then '/login'.
   */
  loginRoute?: string;
}

function createLoginRedirectTree(router: Router, loginRoute: string, returnUrl: string): UrlTree {
  const loginUrlTree = router.parseUrl(loginRoute);
  loginUrlTree.queryParams = {
    ...loginUrlTree.queryParams,
    returnUrl,
  };

  return loginUrlTree;
}

// The URL the in-flight navigation is heading to: after redirects when
// available (canActivate runs post-recognition, so this matches
// RouterStateSnapshot.url), otherwise the requested URL (canMatch runs
// during recognition, before redirects are resolved). Guards always run
// during a navigation; the current URL is a defensive fallback.
function navigationTargetUrl(router: Router): string {
  const navigation = router.getCurrentNavigation();
  if (!navigation) {
    return router.url;
  }
  return router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl);
}

// Every guard decision starts the same way: wait for auth to settle, then
// decide once. Claims-gated guards also wait out a token refresh so `allow`
// never reads claims from a token the server already rejected.
function settledAuthStatus$(auth: ConvexAuthState, waitForRefresh: boolean): Observable<ConvexAuthStatus> {
  return toObservable(auth.status).pipe(
    filter((status) => status !== 'loading' && !(waitForRefresh && status === 'refreshing')),
    take(1),
  );
}

/**
 * Create an auth guard, optionally with a claims-based `allow` check for
 * role- or permission-gated routes. The returned guard waits for auth to
 * settle, redirects unauthenticated users to the login route with a
 * `returnUrl` query param, and treats a token refresh as authenticated.
 * When `allow` is set it runs once the token has settled, with the decoded
 * JWT claims from `injectAuth().getAuth()`; authenticated users who fail
 * the check are sent to `forbiddenRoute`, or blocked when it is omitted.
 *
 * The guard works in both `canActivate` and `canMatch`.
 *
 * @example
 * ```typescript
 * const adminGuard = createConvexAuthGuard({
 *   allow: ({ claims }) => claims['role'] === 'admin',
 *   forbiddenRoute: '/forbidden',
 * });
 *
 * export const routes: Routes = [
 *   {
 *     path: 'admin',
 *     loadComponent: () => import('./admin/admin.component'),
 *     canMatch: [adminGuard],
 *   },
 * ];
 * ```
 *
 * @public
 */
export function createConvexAuthGuard(options?: ConvexAuthGuardOptions): CanActivateFn & CanMatchFn {
  return (): Observable<boolean | UrlTree> => {
    const auth = injectAuth();
    const router = inject(Router);
    const config = inject(CONVEX_AUTH_GUARD_CONFIG, { optional: true });

    const loginRoute = options?.loginRoute ?? config?.loginRoute ?? '/login';
    const returnUrl = navigationTargetUrl(router);
    const allow = options?.allow;

    return settledAuthStatus$(auth, allow !== undefined).pipe(
      map((status) => {
        // 'refreshing' counts as authenticated — it only ever occurs while
        // the user is still authenticated (the backend rejected a previously
        // confirmed token and a replacement is being fetched), so bouncing
        // to login would sign the user out visually for a routine recovery.
        if (status !== 'authenticated' && status !== 'refreshing') {
          return createLoginRedirectTree(router, loginRoute, returnUrl);
        }

        if (!allow) {
          return true;
        }

        const snapshot = auth.getAuth();
        const allowed = snapshot !== undefined && allow({ token: snapshot.token, claims: snapshot.decoded });
        if (allowed) {
          return true;
        }

        return options?.forbiddenRoute ? router.parseUrl(options.forbiddenRoute) : false;
      }),
    );
  };
}

/**
 * Route guard that requires authentication.
 *
 * This guard will:
 * 1. Wait for auth to finish loading
 * 2. Allow navigation if the user is authenticated (including while a
 *    rejected token is being refreshed — see `injectAuth().isRefreshing()`)
 * 3. Redirect to the login route with `returnUrl` if the user is not authenticated
 *
 * The guard works in both `canActivate` and `canMatch`. Prefer `canMatch`
 * for lazy-loaded routes: a failed `canMatch` prevents the route from
 * matching at all, so the protected bundle is never downloaded for
 * unauthenticated users.
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * export const routes: Routes = [
 *   {
 *     path: 'dashboard',
 *     loadComponent: () => import('./dashboard/dashboard.component'),
 *     canMatch: [convexAuthGuard],
 *   },
 *   {
 *     path: 'profile',
 *     loadComponent: () => import('./profile/profile.component'),
 *     canActivate: [convexAuthGuard],
 *   },
 * ];
 * ```
 *
 * @example
 * ```typescript
 * // With custom login route
 * // In app.config.ts
 * providers: [
 *   { provide: CONVEX_AUTH_GUARD_CONFIG, useValue: { loginRoute: '/auth/signin' } },
 * ]
 * ```
 *
 * @public
 */
export const convexAuthGuard: CanActivateFn & CanMatchFn = createConvexAuthGuard();

/**
 * Route guard for routes that only make sense signed out (login,
 * registration). Waits for auth to settle, allows unauthenticated users, and
 * redirects authenticated users to `authenticatedRoute` from
 * {@link CONVEX_AUTH_GUARD_CONFIG} (default '/').
 *
 * Works in both `canActivate` and `canMatch`.
 *
 * @example
 * ```typescript
 * export const routes: Routes = [
 *   {
 *     path: 'login',
 *     loadComponent: () => import('./login/login.component'),
 *     canActivate: [convexUnauthGuard],
 *   },
 * ];
 * ```
 *
 * @public
 */
export const convexUnauthGuard: CanActivateFn & CanMatchFn = (): Observable<boolean | UrlTree> => {
  const auth = injectAuth();
  const router = inject(Router);
  const config = inject(CONVEX_AUTH_GUARD_CONFIG, { optional: true });

  return settledAuthStatus$(auth, false).pipe(
    map((status) => (status === 'unauthenticated' ? true : router.parseUrl(config?.authenticatedRoute ?? '/'))),
  );
};
