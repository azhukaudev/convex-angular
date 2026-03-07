import { InjectionToken, Signal } from '@angular/core';

/**
 * An async function returning a JWT token for authentication.
 *
 * This function is called by the Convex client when it needs a token.
 * The `forceRefreshToken` argument is `true` if the server rejected a
 * previously returned token or the token is anticipated to expire soon.
 *
 * @param args - Object containing forceRefreshToken flag
 * @returns A promise that resolves to the JWT token, or null/undefined if not available
 *
 * @public
 */
export type AuthTokenFetcher = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null | undefined>;

/**
 * Status of the Convex authentication state.
 *
 * - `'loading'`: Auth state is being determined (initial load or token validation)
 * - `'authenticated'`: User is fully authenticated with Convex
 * - `'unauthenticated'`: User is not authenticated
 *
 * @public
 */
export type ConvexAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * The authentication state returned by `injectAuth()`.
 *
 * Provides reactive signals for the current authentication status,
 * including loading state, authentication status, and the most recent
 * unexpected authentication error.
 *
 * @public
 */
export interface ConvexAuthState {
  /**
   * True while the upstream auth provider is loading or Convex is waiting
   * for backend confirmation of the current token.
   */
  isLoading: Signal<boolean>;

  /**
   * True when the user is fully authenticated with Convex.
   * This requires both the auth provider to report authenticated and Convex
   * to confirm the token with the server.
   */
  isAuthenticated: Signal<boolean>;

  /**
   * The most recent authentication error, if any.
   * This includes unexpected provider errors and unexpected token/sync failures.
   * Normal unauthenticated outcomes (for example no token available) do not set it.
   */
  error: Signal<Error | undefined>;

  /**
   * The current authentication status.
   * - 'loading': Auth state is being determined
   * - 'authenticated': User is authenticated
   * - 'unauthenticated': User is not authenticated
   */
  status: Signal<ConvexAuthStatus>;
}

/**
 * Interface for custom auth providers.
 *
 * Implement this interface in your auth service and provide it using
 * the `CONVEX_AUTH` injection token, then call `provideConvexAuth()`.
 *
 * @example
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class MyAuthService implements ConvexAuthProvider {
 *   readonly isLoading = signal(true);
 *   readonly isAuthenticated = signal(false);
 *
 *   constructor() {
 *     // Initialize your auth provider
 *     myAuthProvider.onStateChange((state) => {
 *       this.isLoading.set(false);
 *       this.isAuthenticated.set(state.loggedIn);
 *     });
 *   }
 *
 *   async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
 *     return myAuthProvider.getToken({ refresh: forceRefreshToken });
 *   }
 * }
 * ```
 *
 * @public
 */
export interface ConvexAuthProvider {
  /**
   * Signal indicating whether the auth provider is still loading initial state.
   * When true, the Convex auth state will also be 'loading'.
   */
  isLoading: Signal<boolean>;

  /**
   * Signal indicating whether the auth provider reports the user as authenticated.
   * `injectAuth()` will still remain in the 'loading' state until Convex
   * confirms or rejects the current token.
   */
  isAuthenticated: Signal<boolean>;

  /**
   * Function to fetch the access token.
   * Should return null/undefined if no token is available (e.g., user is logged out).
   *
   * @param args.forceRefreshToken - True if a fresh token is required (cache bypass)
   * @returns Promise resolving to the JWT token, or null if not available
   */
  fetchAccessToken: AuthTokenFetcher;

  /**
   * Optional signal that forces Convex to rerun auth setup while the user
   * remains authenticated. Use this for auth context changes like organization
   * switches that require a new token.
   */
  reauthVersion?: Signal<unknown>;

  /**
   * Optional provider-owned error signal. When present, `injectAuth().error()`
   * mirrors it unless a newer internal auth error was recorded.
   */
  error?: Signal<Error | undefined>;
}

/**
 * Injection token for custom auth providers.
 *
 * Provide your `ConvexAuthProvider` implementation using this token,
 * then call `provideConvexAuth()` to wire it up.
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * providers: [
 *   provideConvex(environment.convexUrl),
 *   { provide: CONVEX_AUTH, useExisting: MyAuthService },
 *   provideConvexAuth(),
 * ]
 * ```
 *
 * @public
 */
export const CONVEX_AUTH = new InjectionToken<ConvexAuthProvider>(
  'CONVEX_AUTH',
);
