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
 *   readonly sessionClaims = computed(() => this.clerk.session?.claims ?? null);
 *
 *   async getToken(options?: { skipCache?: boolean }) {
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
   * @param options.skipCache - If true, bypass the token cache and get a fresh token
   * @returns Promise resolving to the JWT token, or null if not available
   */
  getToken(options?: { skipCache?: boolean }): Promise<string | null>;

  /**
   * Current Clerk session claims.
   * Must be exposed for native Convex Clerk integration validation.
   */
  sessionClaims: Signal<Record<string, unknown> | null | undefined>;

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
 *   readonly orgId = computed(() => this.clerk.organization()?.id);
 *   readonly orgRole = computed(() => this.clerk.organization()?.membership?.role);
 *   readonly sessionClaims = computed(() => this.clerk.session?.claims ?? null);
 *
 *   async getToken(options?: { skipCache?: boolean }) {
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
          const claims = clerk.sessionClaims();
          if (!claims || claims['aud'] !== 'convex') {
            throw new Error(
              "provideClerkAuth() requires Clerk's native Convex integration. " +
                'Expose sessionClaims and ensure aud === \"convex\".',
            );
          }

          return clerk.getToken({
            skipCache: args.forceRefreshToken,
          });
        };

        return {
          isLoading: computed(() => !clerk.isLoaded()),
          isAuthenticated: computed(() => clerk.isSignedIn() ?? false),
          reauthVersion: computed(() => [clerk.orgId?.(), clerk.orgRole?.(), clerk.sessionClaims()]),
          error: clerk.error,
          fetchAccessToken,
        };
      },
    },
    provideConvexAuth(),
  ]);
}
