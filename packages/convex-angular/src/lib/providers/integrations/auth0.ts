import {
  EnvironmentProviders,
  InjectionToken,
  Signal,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';

import { CONVEX_AUTH_CONFIG, ConvexAuthConfig } from '../../tokens/auth';
import { injectAuth } from '../inject-auth';

/**
 * Interface that your Auth0 auth service must implement.
 *
 * This is a low-level integration where you provide your own service
 * that wraps the Auth0 SDK and exposes the necessary signals.
 *
 * @example
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class Auth0AuthService implements Auth0AuthProvider {
 *   private auth0 = inject(AuthService); // from @auth0/auth0-angular
 *
 *   readonly isLoading = toSignal(this.auth0.isLoading$, { initialValue: true });
 *   readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, { initialValue: false });
 *
 *   async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }) {
 *     return this.auth0.getAccessTokenSilently({
 *       cacheMode: options?.cacheMode,
 *     });
 *   }
 * }
 * ```
 *
 * @public
 */
export interface Auth0AuthProvider {
  /**
   * Signal indicating whether Auth0 is still loading.
   * Should be true while initializing, false once auth state is known.
   */
  isLoading: Signal<boolean>;

  /**
   * Signal indicating whether the user is authenticated.
   */
  isAuthenticated: Signal<boolean>;

  /**
   * Function to get an access token from Auth0.
   *
   * @param options.cacheMode - 'on' to use cache, 'off' to bypass cache
   * @returns Promise resolving to the access token
   */
  getAccessTokenSilently(options?: {
    cacheMode?: 'on' | 'off';
  }): Promise<string>;
}

/**
 * Injection token for the Auth0 auth provider.
 *
 * You must provide your own implementation of `Auth0AuthProvider`
 * using this token before calling `provideAuth0Auth()`.
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * providers: [
 *   { provide: AUTH0_AUTH, useClass: Auth0AuthService },
 *   provideAuth0Auth(),
 * ]
 * ```
 *
 * @public
 */
export const AUTH0_AUTH = new InjectionToken<Auth0AuthProvider>('AUTH0_AUTH');

/**
 * Provide Auth0 authentication integration for Convex.
 *
 * This creates a bridge between your Auth0 auth service and Convex.
 * You must first provide your `Auth0AuthProvider` implementation.
 *
 * @example
 * ```typescript
 * // 1. Create your Auth0 auth service
 * @Injectable({ providedIn: 'root' })
 * export class Auth0AuthService implements Auth0AuthProvider {
 *   private auth0 = inject(AuthService); // from @auth0/auth0-angular
 *
 *   readonly isLoading = toSignal(this.auth0.isLoading$, { initialValue: true });
 *   readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, { initialValue: false });
 *
 *   async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }) {
 *     try {
 *       return await firstValueFrom(
 *         this.auth0.getAccessTokenSilently({
 *           cacheMode: options?.cacheMode,
 *         })
 *       );
 *     } catch {
 *       throw new Error('Failed to get access token');
 *     }
 *   }
 * }
 *
 * // 2. Register in app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex(environment.convexUrl),
 *     { provide: AUTH0_AUTH, useClass: Auth0AuthService },
 *     provideAuth0Auth(),
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
export function provideAuth0Auth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH_CONFIG,
      useFactory: (): ConvexAuthConfig => {
        const auth0 = inject(AUTH0_AUTH);

        const fetchAccessToken = async (args: {
          forceRefreshToken: boolean;
        }) => {
          try {
            return await auth0.getAccessTokenSilently({
              cacheMode: args.forceRefreshToken ? 'off' : 'on',
            });
          } catch {
            return null;
          }
        };

        return {
          isLoading: auth0.isLoading,
          isAuthenticated: auth0.isAuthenticated,
          fetchAccessToken,
        };
      },
    },
    provideEnvironmentInitializer(() => {
      injectAuth();
    }),
  ]);
}
