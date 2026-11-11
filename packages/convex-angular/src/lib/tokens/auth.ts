import { InjectionToken, Signal } from '@angular/core';
import type { AuthTokenFetcher as ConvexAuthTokenFetcher } from 'convex/browser';

/**
 * An async function returning a JWT token for authentication.
 *
 * This function is called by the Convex client when it needs a token.
 * The client passes `forceRefreshToken: false` only once per `setAuth`, on
 * its first call. Every later call passes `true`: an immediate retry when
 * that first call returned no token, a refresh once the server accepts the
 * first token, a scheduled refresh before the token expires, and a retry
 * after the server rejects a token.
 *
 * @param args - Object containing forceRefreshToken flag
 * @returns A promise that resolves to the JWT token, or null/undefined if not available
 *
 * @public
 */
export type AuthTokenFetcher = ConvexAuthTokenFetcher;

/**
 * Status of the Convex authentication state.
 *
 * - `'loading'`: Auth state is being determined (initial load or token validation)
 * - `'authenticated'`: User is fully authenticated with Convex
 * - `'refreshing'`: The user remains authenticated, but the server rejected a
 *   previously-confirmed token and Convex paused the socket while it fetches a
 *   replacement. Routine background token rotation does not enter this state.
 * - `'unauthenticated'`: User is not authenticated
 *
 * @public
 */
export type ConvexAuthStatus = 'loading' | 'authenticated' | 'refreshing' | 'unauthenticated';

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
   * to confirm the token with the server. Remains true while `isRefreshing`
   * is true so the UI does not flicker to a signed-out state during a refresh.
   */
  isAuthenticated: Signal<boolean>;

  /**
   * True when the server rejected a previously-confirmed token and Convex
   * paused the socket while fetching a replacement. Only ever true while
   * `isAuthenticated` is also true. Routine background token rotation does
   * not trigger this state.
   */
  isRefreshing: Signal<boolean>;

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
   * - 'refreshing': User is authenticated but Convex is fetching a replacement
   *   token after a server rejection
   * - 'unauthenticated': User is not authenticated
   */
  status: Signal<ConvexAuthStatus>;

  /**
   * Get the JWT currently used by the Convex client together with its decoded
   * claims, or undefined when no token is set (or during server-side
   * rendering, where the WebSocket client is disabled).
   *
   * This is a snapshot method, not a signal: the Convex client does not emit
   * token-change events, so read it on demand (for example right before
   * calling an external API that should reuse the Convex token).
   */
  getAuth: () => { token: string; decoded: Record<string, unknown> } | undefined;
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
   * A null from the first (non-forced) call is not final: Convex retries at
   * once with `forceRefreshToken: true`, and `injectAuth()` stays 'loading'
   * until that retry, or the server, decides. (On a `reauthVersion` re-run,
   * where the client still holds the previous token, a null settles
   * 'unauthenticated' at once.)
   *
   * @param args.forceRefreshToken - True if a fresh token is required (cache bypass)
   * @returns Promise resolving to the JWT token, or null if not available
   */
  fetchAccessToken: AuthTokenFetcher;

  /**
   * Optional signal that forces Convex to rerun auth setup while the user
   * remains authenticated. Use this for auth context changes like organization
   * switches that require a new token.
   *
   * Every new value reruns auth setup (status returns to `'loading'` until
   * Convex confirms the new token), and "new" is decided by the signal's
   * equality — `Object.is` unless you pass `equal`. Return a primitive (a
   * string key or a counter), or give the `computed()` an `equal` function:
   * a `computed()` that builds a fresh array or object is a new value every
   * time it re-evaluates, for example after a token refresh that updates
   * your session state, and would rerun auth setup each time.
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
export const CONVEX_AUTH = new InjectionToken<ConvexAuthProvider>('CONVEX_AUTH');
