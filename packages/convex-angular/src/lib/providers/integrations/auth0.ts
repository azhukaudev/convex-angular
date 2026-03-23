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
 * Minimal Auth0 detailed token response required by Convex.
 *
 * Auth0's Angular SDK can return a richer object, but Convex only needs the
 * `id_token` from that response.
 *
 * @public
 */
export interface Auth0TokenResponse {
  id_token: string;
  [key: string]: unknown;
}

function extractAuth0IdToken(response: unknown): string {
  if (
    typeof response === 'object' &&
    response !== null &&
    'id_token' in response &&
    typeof response.id_token === 'string' &&
    response.id_token.length > 0
  ) {
    return response.id_token;
  }

  throw new Error(
    'Auth0 provider must return the detailed response from `getAccessTokenSilently(...)` with an `id_token`. ' +
      'String-only token providers are no longer supported.',
  );
}

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
 *   async getAccessTokenSilently(options: {
 *     detailedResponse: true;
 *     cacheMode?: 'on' | 'off';
 *   }) {
 *     return firstValueFrom(this.auth0.getAccessTokenSilently({
 *       detailedResponse: options.detailedResponse,
 *       cacheMode: options?.cacheMode,
 *     }));
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
   * @param options.detailedResponse - Must be `true` so the provider returns
   * the Auth0 detailed token response including `id_token`
   * @param options.cacheMode - 'on' to use cache, 'off' to bypass cache
   * @returns Promise resolving to the detailed token response
   */
  getAccessTokenSilently(options: { detailedResponse: true; cacheMode?: 'on' | 'off' }): Promise<Auth0TokenResponse>;

  /**
   * Optional provider-owned error signal.
   */
  error?: Signal<Error | undefined>;
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
 *   async getAccessTokenSilently(options: {
 *     detailedResponse: true;
 *     cacheMode?: 'on' | 'off';
 *   }) {
 *     return firstValueFrom(
 *       this.auth0.getAccessTokenSilently({
 *         detailedResponse: options.detailedResponse,
 *         cacheMode: options?.cacheMode,
 *       })
 *     );
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
      provide: CONVEX_AUTH,
      useFactory: (): ConvexAuthProvider => {
        const auth0 = inject(AUTH0_AUTH);

        return {
          isLoading: computed(() => auth0.isLoading()),
          isAuthenticated: computed(() => auth0.isAuthenticated()),
          error: auth0.error,
          fetchAccessToken: async (args) =>
            extractAuth0IdToken(
              await auth0.getAccessTokenSilently({
                detailedResponse: true,
                cacheMode: args.forceRefreshToken ? 'off' : 'on',
              }),
            ),
        };
      },
    },
    provideConvexAuth(),
  ]);
}
