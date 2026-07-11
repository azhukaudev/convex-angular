import {
  EnvironmentProviders,
  InjectionToken,
  Signal,
  computed,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';

import { CONVEX_AUTH, ConvexAuthProvider } from '../../tokens/auth';
import { provideConvexAuth } from '../inject-auth';

/**
 * Interface that your Clerk auth service must implement.
 *
 * This is a low-level integration where you provide your own service
 * that wraps the Clerk SDK and exposes the necessary signals.
 *
 * @example
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class ClerkAuthService implements ClerkAuthProvider {
 *   private clerk = inject(Clerk);
 *
 *   readonly isLoaded = computed(() => this.clerk.loaded());
 *   readonly isSignedIn = computed(() => !!this.clerk.user());
 *   readonly sessionId = computed(() => this.clerk.session()?.id);
 *
 *   async getToken(options?: { template?: string; skipCache?: boolean }) {
 *     return this.clerk.session?.getToken(options) ?? null;
 *   }
 * }
 * ```
 *
 * @public
 */
export interface ClerkAuthProvider {
  /**
   * Signal indicating whether Clerk has finished loading.
   * Should be true once Clerk is initialized and auth state is known.
   */
  isLoaded: Signal<boolean>;

  /**
   * Signal indicating whether the user is signed in.
   * May be undefined while loading.
   */
  isSignedIn: Signal<boolean | undefined>;

  /**
   * Function to get an access token from Clerk.
   *
   * @param options.template - The JWT template to use (should be 'convex' for Convex)
   * @param options.skipCache - If true, bypass the token cache and get a fresh token
   * @returns Promise resolving to the JWT token, or null if not available
   */
  getToken(options?: { template?: string; skipCache?: boolean }): Promise<string | null>;

  /**
   * Optional: Current Clerk session ID.
   * When this changes (e.g. signing out and back in replaces the session),
   * Convex will re-run auth setup with a token for the new session.
   *
   * Without it, a replaced session can leave Convex fetching tokens for the
   * dead session — auth looks loaded but stays unauthenticated until reload.
   */
  sessionId?: Signal<string | null | undefined>;

  /**
   * Optional: Current organization ID.
   * When this changes, Convex will refetch the token.
   */
  orgId?: Signal<string | null | undefined>;

  /**
   * Optional: Current organization role.
   * When this changes, Convex will refetch the token.
   */
  orgRole?: Signal<string | null | undefined>;

  /**
   * Optional: the session token's `aud` claim. When it is 'convex' the
   * adapter uses Clerk's native Convex integration (no JWT template);
   * otherwise it requests the 'convex' JWT template.
   */
  sessionAudience?: Signal<string | null | undefined>;

  /**
   * Optional provider-owned error signal.
   */
  error?: Signal<Error | undefined>;
}

/**
 * Injection token for the Clerk auth provider.
 *
 * You must provide your own implementation of `ClerkAuthProvider`
 * using this token before calling `provideClerkAuth()`.
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * providers: [
 *   { provide: CLERK_AUTH, useClass: ClerkAuthService },
 *   provideClerkAuth(),
 * ]
 * ```
 *
 * @public
 */
export const CLERK_AUTH = new InjectionToken<ClerkAuthProvider>('CLERK_AUTH');

/**
 * Provide Clerk authentication integration for Convex.
 *
 * This creates a bridge between your Clerk auth service and Convex.
 * You must first provide your `ClerkAuthProvider` implementation.
 *
 * @example
 * ```typescript
 * // 1. Create your Clerk auth service
 * @Injectable({ providedIn: 'root' })
 * export class ClerkAuthService implements ClerkAuthProvider {
 *   private clerk = inject(Clerk);
 *
 *   readonly isLoaded = computed(() => this.clerk.loaded());
 *   readonly isSignedIn = computed(() => !!this.clerk.user());
 *   readonly sessionId = computed(() => this.clerk.session()?.id);
 *   readonly orgId = computed(() => this.clerk.organization()?.id);
 *   readonly orgRole = computed(() => this.clerk.organization()?.membership?.role);
 *
 *   async getToken(options?: { template?: string; skipCache?: boolean }) {
 *     return (await this.clerk.session?.getToken(options)) ?? null;
 *   }
 * }
 *
 * // 2. Register in app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex(environment.convexUrl),
 *     { provide: CLERK_AUTH, useClass: ClerkAuthService },
 *     provideClerkAuth(),
 *   ],
 * };
 *
 * // 3. Use in components
 * export class AppComponent {
 *   readonly auth = injectAuth();
 * }
 * ```
 *
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideClerkAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH,
      useFactory: (): ConvexAuthProvider => {
        const clerk = inject(CLERK_AUTH);

        const fetchAccessToken = async (args: { forceRefreshToken: boolean }) => {
          // Mirrors convex-react's Clerk adapter: a failed token fetch is the
          // signed-out outcome, not an auth error.
          try {
            if (clerk.sessionAudience?.() === 'convex') {
              // Using Clerk's native Convex integration: no JWT template.
              return await clerk.getToken({ skipCache: args.forceRefreshToken });
            }

            return await clerk.getToken({
              template: 'convex',
              skipCache: args.forceRefreshToken,
            });
          } catch {
            return null;
          }
        };

        return {
          isLoading: computed(() => !clerk.isLoaded()),
          isAuthenticated: computed(() => clerk.isSignedIn() ?? false),
          reauthVersion: computed(() => [clerk.sessionId?.(), clerk.orgId?.(), clerk.orgRole?.()]),
          error: clerk.error,
          fetchAccessToken,
        };
      },
    },
    provideConvexAuth(),
  ]);
}
