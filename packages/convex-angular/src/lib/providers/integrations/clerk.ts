import {
  EnvironmentProviders,
  InjectionToken,
  Signal,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';

import { CONVEX_AUTH_CONFIG, ConvexAuthConfig } from '../../tokens/auth';
import { ConvexAuthSyncService, injectAuth } from '../inject-auth';

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
   * Must resolve to a definite boolean (use `!!` or `?? false` if the
   * underlying SDK provides `boolean | undefined`).
   */
  isSignedIn: Signal<boolean>;

  /**
   * Function to get an access token from Clerk.
   *
   * @param options.template - The JWT template to use (should be 'convex' for Convex)
   * @param options.skipCache - If true, bypass the token cache and get a fresh token
   * @returns Promise resolving to the JWT token, or null if not available
   */
  getToken(options?: {
    template?: string;
    skipCache?: boolean;
  }): Promise<string | null>;

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
 *
 *   async getToken(options?: { template?: string; skipCache?: boolean }) {
 *     try {
 *       return await this.clerk.session?.getToken(options) ?? null;
 *     } catch {
 *       return null;
 *     }
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
    ConvexAuthSyncService,
    {
      provide: CONVEX_AUTH_CONFIG,
      useFactory: (): ConvexAuthConfig => {
        const clerk = inject(CLERK_AUTH);

        // Create computed signals that bridge Clerk to Convex
        const isLoading = computed(() => !clerk.isLoaded());

        // Tracks org-context changes. Incremented by an effect whenever
        // orgId or orgRole changes, which causes `isAuthenticated` (below)
        // to re-emit and trigger re-authentication in ConvexAuthSyncService.
        const orgVersion = signal(0);

        // Effect that watches org signals and bumps orgVersion on change.
        // This is necessary because fetchAccessToken is async — reading
        // signals inside async functions is NOT tracked by Angular's
        // reactivity system. Instead, we funnel org changes through a
        // synchronous signal that the auth sync effect can observe.
        if (clerk.orgId || clerk.orgRole) {
          effect(() => {
            clerk.orgId?.();
            clerk.orgRole?.();
            // Use untracked write to avoid circular dependency
            orgVersion.update((v) => v + 1);
          });
        }

        // Reading orgVersion here makes the auth sync effect re-run
        // whenever the org context changes, triggering a fresh setAuth call.
        const isAuthenticated = computed(() => {
          orgVersion();
          return clerk.isSignedIn();
        });

        const fetchAccessToken = async (args: {
          forceRefreshToken: boolean;
        }) => {
          try {
            return await clerk.getToken({
              template: 'convex',
              skipCache: args.forceRefreshToken,
            });
          } catch (error) {
            console.error(
              '[Convex Auth] Failed to fetch Clerk access token:',
              error,
            );
            return null;
          }
        };

        return {
          isLoading,
          isAuthenticated,
          fetchAccessToken,
        };
      },
    },
    provideEnvironmentInitializer(() => {
      injectAuth();
    }),
  ]);
}
