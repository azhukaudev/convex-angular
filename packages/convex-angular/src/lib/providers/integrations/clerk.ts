import {
  InjectionToken,
  Provider,
  Signal,
  computed,
  inject,
} from '@angular/core';

import { CONVEX_AUTH_CONFIG, ConvexAuthConfig } from '../../tokens/auth';

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
 * @returns Provider to add to your application providers
 *
 * @public
 */
export function provideClerkAuth(): Provider {
  return {
    provide: CONVEX_AUTH_CONFIG,
    useFactory: (): ConvexAuthConfig => {
      const clerk = inject(CLERK_AUTH);

      // Create computed signals that bridge Clerk to Convex
      const isLoading = computed(() => !clerk.isLoaded());
      const isAuthenticated = computed(() => clerk.isSignedIn() ?? false);

      // Create a version signal that changes when org context changes
      // This triggers a token refresh when organization changes
      const tokenVersion = computed(() => {
        // Access org signals to create dependency (if they exist)
        clerk.orgId?.();
        clerk.orgRole?.();
        // Return a new object each time to trigger change detection
        return {};
      });

      const fetchAccessToken = async (args: { forceRefreshToken: boolean }) => {
        // Track token version for reactivity (read the signal)
        tokenVersion();

        try {
          return await clerk.getToken({
            template: 'convex',
            skipCache: args.forceRefreshToken,
          });
        } catch {
          return null;
        }
      };

      return {
        isLoading,
        isAuthenticated,
        fetchAccessToken,
      };
    },
  };
}
