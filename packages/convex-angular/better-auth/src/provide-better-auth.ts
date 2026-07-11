import { EnvironmentInjector, EnvironmentProviders, Signal, inject, makeEnvironmentProviders } from '@angular/core';
import { provideConvexAuthFromExisting } from 'convex-angular';

import { BetterAuthClientLike, BetterAuthSessionData } from './better-auth-client';
import { BETTER_AUTH_CLIENT_FACTORY, BetterAuthService } from './better-auth.service';

/**
 * Reactive Better Auth session state returned by {@link injectBetterAuth}.
 *
 * @public
 */
export interface BetterAuthState {
  /** The current session snapshot, or null when signed out. */
  session: Signal<BetterAuthSessionData | null>;
  /** True while the session is being (re)loaded. */
  isLoading: Signal<boolean>;
  /** True when a session is present. */
  isAuthenticated: Signal<boolean>;
  /** The most recent unexpected session or token-exchange failure. */
  error: Signal<Error | undefined>;
  /** Re-sync the session after completing a sign-in/up/out flow. */
  refreshSession(): Promise<void>;
  /** Clear the local session and token cache (local sign-out bookkeeping). */
  clearSession(): void;
}

/**
 * Options for {@link injectBetterAuth}.
 *
 * @public
 */
export interface InjectBetterAuthOptions {
  /**
   * Environment injector used to resolve the state outside the current
   * injection context.
   */
  injectRef?: EnvironmentInjector;
}

/**
 * Provide Better Auth authentication integration for Convex.
 *
 * Pass a factory creating your Better Auth client (with the `convexClient()`
 * plugin from `@convex-dev/better-auth`, and typically `crossDomainClient()`).
 * The library handles session tracking, Convex token exchange with caching
 * and refresh, and wiring into Convex auth sync. Includes
 * `provideConvexAuth()` — do not register it separately.
 *
 * Sign-in/up/out flows stay on your client instance; call
 * `injectBetterAuth().refreshSession()` after they complete.
 *
 * @example
 * ```typescript
 * // auth-client.ts — one shared client instance for flows and the library
 * import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
 * import { createAuthClient } from 'better-auth/client';
 *
 * export const authClient = createAuthClient({
 *   baseURL: environment.convexSiteUrl,
 *   plugins: [convexClient(), crossDomainClient()],
 * });
 *
 * // app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex(environment.convexUrl),
 *     provideBetterAuth(() => authClient),
 *   ],
 * };
 * ```
 *
 * @param clientFactory - Returns your Better Auth client; invoked lazily, browser-only
 * @returns EnvironmentProviders to add to your root application providers
 *
 * @public
 */
export function provideBetterAuth(clientFactory: () => BetterAuthClientLike): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: BETTER_AUTH_CLIENT_FACTORY, useValue: clientFactory },
    BetterAuthService,
    provideConvexAuthFromExisting(BetterAuthService),
  ]);
}

/**
 * Inject the Better Auth session state registered by {@link provideBetterAuth}.
 *
 * @public
 */
export function injectBetterAuth(options?: InjectBetterAuthOptions): BetterAuthState {
  if (options?.injectRef) {
    return options.injectRef.get(BetterAuthService);
  }

  const service = inject(BetterAuthService, { optional: true });
  if (!service) {
    throw new Error(
      'Could not find BetterAuthService. Call provideBetterAuth(...) in your providers, or pass { injectRef } when calling injectBetterAuth() outside an injection context.',
    );
  }
  return service;
}
