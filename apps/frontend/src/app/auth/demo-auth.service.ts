import { Injectable, signal } from '@angular/core';
import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';
import { ConvexAuthProvider } from 'convex-angular';

import { environment } from '../../environments/environment';

type AuthSessionSnapshot = {
  session: {
    id: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null;
  };
};

type TokenExchangeResult = {
  data: {
    token?: string | null;
  } | null;
  error: {
    message?: string;
    status?: number;
  } | null;
};

type EmailAuthResult = {
  error: {
    message?: string;
  } | null;
};

function createDemoAuthClient() {
  return createAuthClient({
    baseURL: environment.convexSiteUrl,
    plugins: [
      convexClient(),
      crossDomainClient({
        storagePrefix: 'convex-angular-demo',
      }),
    ],
  });
}

type DemoAuthClient = ReturnType<typeof createDemoAuthClient>;

@Injectable()
export class DemoAuthService implements ConvexAuthProvider {
  private authClient: DemoAuthClient | null = null;

  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly formErrorMessage = signal<string | null>(null);
  readonly session = signal<AuthSessionSnapshot | null>(null);
  readonly reauthVersion = signal(0);

  private cachedToken: string | null = null;
  private pendingToken: Promise<string | null> | null = null;
  private lastSessionId: string | null = null;
  private tokenGeneration = 0;

  constructor() {
    if (!environment.convexSiteUrl) {
      this.error.set(
        new Error(
          '[demo auth] Missing NG_APP_CONVEX_SITE_URL. Set it to your Convex .site origin before using the auth demo.',
        ),
      );
      this.isLoading.set(false);
      return;
    }

    void this.refreshSession();
  }

  private getAuthClient(): DemoAuthClient {
    this.authClient ??= createDemoAuthClient();

    return this.authClient;
  }

  private async runEmailAuth(
    request: () => Promise<EmailAuthResult>,
    formErrorMessage: string,
    errorContext: string,
  ): Promise<boolean> {
    this.formErrorMessage.set(null);
    this.error.set(undefined);
    this.isLoading.set(true);

    try {
      const result = await request();

      if (result.error) {
        this.formErrorMessage.set(result.error.message ?? formErrorMessage);
        this.applySession(null);
        this.isLoading.set(false);
        return false;
      }

      await this.refreshSession();
      return this.isAuthenticated();
    } catch (error) {
      this.error.set(this.normalizeError(error, errorContext));
      this.applySession(null);
      this.isLoading.set(false);
      return false;
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    return this.runEmailAuth(
      () =>
        this.getAuthClient().signIn.email({
          email,
          password,
          callbackURL: this.getSuccessUrl(),
          fetchOptions: { throw: false },
        }),
      'Unable to sign in with those credentials.',
      '[demo auth] Better Auth sign-in failed',
    );
  }

  async signUp(name: string, email: string, password: string): Promise<boolean> {
    return this.runEmailAuth(
      () =>
        this.getAuthClient().signUp.email({
          name,
          email,
          password,
          callbackURL: this.getSuccessUrl(),
          fetchOptions: { throw: false },
        }),
      'Unable to create that account.',
      '[demo auth] Better Auth sign-up failed',
    );
  }

  async signOut(): Promise<void> {
    this.formErrorMessage.set(null);
    this.error.set(undefined);
    this.isLoading.set(true);

    try {
      const result = await this.getAuthClient().signOut({
        fetchOptions: { throw: false },
      });

      if (result.error && !this.isExpectedAuthStatus(result.error.status)) {
        this.error.set(this.normalizeError(result.error, '[demo auth] Better Auth sign-out failed'));
      }
    } catch (error) {
      this.error.set(this.normalizeError(error, '[demo auth] Better Auth sign-out failed'));
    } finally {
      this.getAuthClient().updateSession();
      this.applySession(null);
      this.isLoading.set(false);
    }
  }

  async refreshSession(): Promise<void> {
    this.formErrorMessage.set(null);

    if (!environment.convexSiteUrl) {
      this.applySession(null);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      const result = await this.getAuthClient().getSession({
        fetchOptions: { throw: false },
      });

      if (result.error && !this.isExpectedAuthStatus(result.error.status)) {
        this.error.set(this.normalizeError(result.error, '[demo auth] Better Auth session refresh failed'));
      } else {
        this.error.set(undefined);
      }

      const sessionData =
        result.data ?? (this.getAuthClient().getSessionData?.() as AuthSessionSnapshot | null) ?? null;

      this.applySession(sessionData);
    } catch (error) {
      this.error.set(this.normalizeError(error, '[demo auth] Better Auth session refresh failed'));
      this.applySession(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFormError(): void {
    this.formErrorMessage.set(null);
  }

  readonly fetchAccessToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
    if (!this.isAuthenticated()) {
      return null;
    }

    if (this.cachedToken && !forceRefreshToken) {
      return this.cachedToken;
    }

    if (!forceRefreshToken && this.pendingToken) {
      return this.pendingToken;
    }

    const tokenGeneration = this.tokenGeneration;

    const request = this.getAuthClient()
      .convex.token({
        fetchOptions: { throw: false },
      })
      .then(({ data, error }: TokenExchangeResult) => {
        if (!this.isCurrentTokenGeneration(tokenGeneration)) {
          return null;
        }

        if (error) {
          if (!this.isExpectedAuthStatus(error.status)) {
            this.error.set(this.normalizeError(error, '[demo auth] Convex token exchange failed'));
          }
          this.cachedToken = null;
          return null;
        }

        this.error.set(undefined);
        this.cachedToken = data?.token ?? null;
        return this.cachedToken;
      })
      .catch((error: unknown) => {
        if (!this.isCurrentTokenGeneration(tokenGeneration)) {
          return null;
        }

        this.error.set(this.normalizeError(error, '[demo auth] Convex token exchange failed'));
        this.cachedToken = null;
        return null;
      })
      .finally(() => {
        if (this.pendingToken === request) {
          this.pendingToken = null;
        }
      });

    this.pendingToken = request;

    return request;
  };

  private applySession(session: AuthSessionSnapshot | null): void {
    this.session.set(session);
    this.isAuthenticated.set(Boolean(session?.session));

    const nextSessionId = session?.session.id ?? null;
    if (this.lastSessionId !== nextSessionId) {
      this.lastSessionId = nextSessionId;
      this.invalidateTokenState();
      this.bumpReauthVersion();
    }
  }

  private bumpReauthVersion(): void {
    this.reauthVersion.update((version) => version + 1);
  }

  private invalidateTokenState(): void {
    this.tokenGeneration += 1;
    this.cachedToken = null;
    this.pendingToken = null;
  }

  private isCurrentTokenGeneration(tokenGeneration: number): boolean {
    return tokenGeneration === this.tokenGeneration;
  }

  private getSuccessUrl(): string {
    const baseUrl = environment.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '');

    return baseUrl ? new URL('/auth/success', baseUrl).toString() : '/auth/success';
  }

  private isExpectedAuthStatus(status?: number): boolean {
    return status === 401 || status === 403;
  }

  private normalizeError(error: unknown, prefix: string): Error {
    if (error instanceof Error) {
      return new Error(`${prefix}: ${error.message}`);
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return new Error(`${prefix}: ${error.message}`);
    }

    return new Error(`${prefix}: ${String(error)}`);
  }
}
