import { ApplicationConfig, Injectable, InjectionToken, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AUTH0_AUTH, Auth0AuthProvider, provideAuth0Auth, provideConvex } from 'convex-angular';
import { Observable, firstValueFrom } from 'rxjs';

/**
 * These docs do not depend on `@auth0/auth0-angular`, so the slice of its
 * `AuthService` used below is declared locally, with the same shape: Observables,
 * not Signals or Promises. In your application you inject the real `AuthService`
 * (`inject(AuthService)`) instead of this token.
 */
interface Auth0Sdk {
  isLoading$: Observable<boolean>;
  isAuthenticated$: Observable<boolean>;
  getAccessTokenSilently(options: {
    detailedResponse: true;
    cacheMode?: 'on' | 'off';
  }): Observable<{ id_token: string } | undefined>;
}

const AUTH0_SDK = new InjectionToken<Auth0Sdk>('AUTH0_SDK');

@Injectable({ providedIn: 'root' })
export class Auth0AuthService implements Auth0AuthProvider {
  private readonly auth0 = inject(AUTH0_SDK);

  readonly isLoading = toSignal(this.auth0.isLoading$, { initialValue: true });
  readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, { initialValue: false });

  // Convex validates the OIDC **id token**, not the access token, so ask for
  // the detailed response and return `id_token`. The SDK call returns an
  // Observable, so unwrap it with `firstValueFrom` before reading the token.
  async getAccessTokenSilently(options?: { cacheMode?: 'on' | 'off' }): Promise<string | null> {
    const response = await firstValueFrom(
      this.auth0.getAccessTokenSilently({
        detailedResponse: true,
        cacheMode: options?.cacheMode,
      }),
    );

    return response?.id_token ?? null;
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
