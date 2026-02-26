import { InjectionToken, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { injectAuth } from '../providers/inject-auth';

/**
 * Configuration for auth guards.
 *
 * @public
 */
export interface ConvexAuthGuardConfig {
  /**
   * The route to redirect to when authentication is required but user is not authenticated.
   * Used by `convexAuthGuard`.
   * @default '/login'
   */
  loginRoute?: string;

  /**
   * The route to redirect to when user is already authenticated.
   * Used by `convexUnauthGuard` to redirect away from public-only pages (login, register).
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
export const CONVEX_AUTH_GUARD_CONFIG =
  new InjectionToken<ConvexAuthGuardConfig>('CONVEX_AUTH_GUARD_CONFIG');

/**
 * Route guard that requires authentication.
 *
 * This guard will:
 * 1. Wait for auth to finish loading
 * 2. Allow navigation if the user is authenticated
 * 3. Redirect to the login route if the user is not authenticated
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * export const routes: Routes = [
 *   {
 *     path: 'dashboard',
 *     loadComponent: () => import('./dashboard/dashboard.component'),
 *     canActivate: [convexAuthGuard],
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
export const convexAuthGuard: CanActivateFn = (): Observable<
  boolean | UrlTree
> => {
  const auth = injectAuth();
  const router = inject(Router);
  const config = inject(CONVEX_AUTH_GUARD_CONFIG, { optional: true });

  const loginRoute = config?.loginRoute ?? '/login';

  // Convert signal to observable
  const status$ = toObservable(auth.status);

  return status$.pipe(
    // Wait until not loading
    filter((status) => status !== 'loading'),
    // Take only the first emission after loading completes
    take(1),
    // Map to boolean or redirect
    map((status) => {
      if (status === 'authenticated') {
        return true;
      }
      // Redirect to login
      return router.createUrlTree([loginRoute]);
    }),
  );
};

/**
 * Route guard that prevents authenticated users from accessing public-only pages.
 *
 * This is the inverse of `convexAuthGuard`. Use it on login, register, and
 * other pages that should only be accessible to unauthenticated users.
 *
 * This guard will:
 * 1. Wait for auth to finish loading
 * 2. Allow navigation if the user is NOT authenticated
 * 3. Redirect to the authenticated route if the user IS authenticated
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * export const routes: Routes = [
 *   {
 *     path: 'login',
 *     loadComponent: () => import('./login/login.component'),
 *     canActivate: [convexUnauthGuard],
 *   },
 *   {
 *     path: 'register',
 *     loadComponent: () => import('./register/register.component'),
 *     canActivate: [convexUnauthGuard],
 *   },
 * ];
 * ```
 *
 * @example
 * ```typescript
 * // With custom redirect route
 * // In app.config.ts
 * providers: [
 *   { provide: CONVEX_AUTH_GUARD_CONFIG, useValue: { authenticatedRoute: '/dashboard' } },
 * ]
 * ```
 *
 * @public
 */
export const convexUnauthGuard: CanActivateFn = (): Observable<
  boolean | UrlTree
> => {
  const auth = injectAuth();
  const router = inject(Router);
  const config = inject(CONVEX_AUTH_GUARD_CONFIG, { optional: true });

  const authenticatedRoute = config?.authenticatedRoute ?? '/';

  // Convert signal to observable
  const status$ = toObservable(auth.status);

  return status$.pipe(
    // Wait until not loading
    filter((status) => status !== 'loading'),
    // Take only the first emission after loading completes
    take(1),
    // Map to boolean or redirect
    map((status) => {
      if (status === 'unauthenticated') {
        return true;
      }
      // Redirect authenticated users away
      return router.createUrlTree([authenticatedRoute]);
    }),
  );
};
