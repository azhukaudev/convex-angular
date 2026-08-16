import { ApplicationConfig, Injectable, computed, signal } from '@angular/core';
import { ConvexAuthProvider, provideConvex, provideConvexAuthFromExisting } from 'convex-angular';

interface Session {
  id: string;
  organizationId: string;
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class MyAuthService implements ConvexAuthProvider {
  private readonly session = signal<Session | null>(null);
  private readonly loading = signal(true);

  readonly isLoading = this.loading.asReadonly();
  readonly isAuthenticated = computed(() => this.session() !== null);

  // Optional. Any change re-runs Convex auth setup while the user stays signed
  // in — use it for context switches (organization, workspace, impersonation)
  // that require a different token.
  readonly reauthVersion = computed(() => [this.session()?.id, this.session()?.organizationId]);

  // Optional. `injectAuth().error()` mirrors this signal unless a newer
  // internal auth error was recorded.
  readonly error = signal<Error | undefined>(undefined);

  async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> {
    const session = this.session();
    if (!session) {
      // Returning null is the ordinary signed-out outcome; it does not set an error.
      return null;
    }

    if (!forceRefreshToken) {
      return session.accessToken;
    }

    // Anything thrown here surfaces on `injectAuth().error()` prefixed with
    // '[convex-angular auth] Token fetch failed: '.
    const response = await fetch('/api/token', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Token endpoint returned ${response.status}`);
    }

    const { token } = (await response.json()) as { token: string };
    this.session.update((current) => (current ? { ...current, accessToken: token } : current));
    return token;
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://example-123.convex.cloud'),
    // Registers `{ provide: CONVEX_AUTH, useExisting: MyAuthService }` and
    // `provideConvexAuth()` together. Root-only, exactly once.
    provideConvexAuthFromExisting(MyAuthService),
  ],
};
