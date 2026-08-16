import { ApplicationConfig, Injectable, InjectionToken, Signal, inject } from '@angular/core';
import { AUTH0_AUTH, Auth0AuthProvider, provideAuth0Auth, provideConvex } from 'convex-angular';

/**
 * These docs do not depend on `@auth0/auth0-angular`, so the slice of its
 * `AuthService` used below is declared locally. In your application you inject
 * the real `AuthService` and bridge its observables with `toSignal(...)`.
 */
interface Auth0Sdk {
  isLoading: Signal<boolean>;
  isAuthenticated: Signal<boolean>;
  getAccessTokenSilently(options: { detailedResponse: true; cacheMode?: 'on' | 'off' }): Promise<{ id_token: string }>;
}

const AUTH0_SDK = new InjectionToken<Auth0Sdk>('AUTH0_SDK');

@Injectable({ providedIn: 'root' })
export class Auth0AuthService implements Auth0AuthProvider {
  private readonly auth0 = inject(AUTH0_SDK);

  readonly isLoading = this.auth0.isLoading;
  readonly isAuthenticated = this.auth0.isAuthenticated;

  // Convex validates the OIDC **id token**, not the access token, so ask for
  // the detailed response and return `id_token`.
  async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }): Promise<string | null> {
    const response = await this.auth0.getAccessTokenSilently({
      detailedResponse: true,
      cacheMode: options?.cacheMode,
    });

    return response.id_token;
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://example-123.convex.cloud'),
    { provide: AUTH0_AUTH, useExisting: Auth0AuthService },
    // Already includes provideConvexAuth(). Do not register that as well.
    provideAuth0Auth(),
  ],
};
