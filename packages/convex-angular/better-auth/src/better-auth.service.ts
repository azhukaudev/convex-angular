import { isPlatformServer } from '@angular/common';
import { Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { ConvexAuthProvider } from 'convex-angular';

import { BetterAuthClientLike, BetterAuthSessionData } from './better-auth-client';

/**
 * Factory producing the consumer's Better Auth client. Registered by
 * provideBetterAuth(); invoked lazily and only in the browser.
 *
 * @internal
 */
export const BETTER_AUTH_CLIENT_FACTORY = new InjectionToken<() => BetterAuthClientLike>('BETTER_AUTH_CLIENT_FACTORY');

function isExpectedAuthStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

function normalizeError(error: unknown, prefix: string): Error {
  if (error instanceof Error) {
    return new Error(`${prefix}: ${error.message}`);
  }
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return new Error(`${prefix}: ${error.message}`);
  }
  return new Error(`${prefix}: ${String(error)}`);
}

/**
 * Better Auth session and Convex token state. Implements ConvexAuthProvider
 * for provideConvexAuth() wiring and backs injectBetterAuth().
 *
 * @internal
 */
@Injectable()
export class BetterAuthService implements ConvexAuthProvider {
  private readonly clientFactory = inject(BETTER_AUTH_CLIENT_FACTORY);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private client: BetterAuthClientLike | null = null;

  private readonly sessionState = signal<BetterAuthSessionData | null>(null);
  readonly session = this.sessionState.asReadonly();
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly reauthVersion = signal(0);

  private cachedToken: string | null = null;
  private pendingToken: Promise<string | null> | null = null;
  private lastSessionId: string | null = null;
  private tokenGeneration = 0;

  constructor() {
    if (this.isServer) {
      // Browser-only by design: server-side authenticated SSR goes through
      // provideConvex's ssr.authToken instead.
      this.isLoading.set(false);
      return;
    }

    void this.refreshSession();
  }

  /**
   * Re-sync the session from Better Auth. Call after completing a sign-in,
   * sign-up, or sign-out flow on your own client instance.
   */
  async refreshSession(): Promise<void> {
    if (this.isServer) {
      return;
    }

    this.isLoading.set(true);

    try {
      const result = await this.getClient().getSession({ fetchOptions: { throw: false } });

      if (result.error && !isExpectedAuthStatus(result.error.status)) {
        this.error.set(normalizeError(result.error, '[convex-angular better-auth] Session refresh failed'));
      } else {
        this.error.set(undefined);
      }

      const sessionData = result.data ?? this.getClient().getSessionData?.() ?? null;
      this.applySession(sessionData);
    } catch (error) {
      this.error.set(normalizeError(error, '[convex-angular better-auth] Session refresh failed'));
      this.applySession(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Mark the user signed out locally: clears the session snapshot, the token
   * cache, and notifies the client's session listeners.
   */
  clearSession(): void {
    if (!this.isServer) {
      this.client?.updateSession?.();
    }
    this.applySession(null);
    this.isLoading.set(false);
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

    const request = this.getClient()
      .convex.token({ fetchOptions: { throw: false } })
      .then(({ data, error }) => {
        if (tokenGeneration !== this.tokenGeneration) {
          return null;
        }

        if (error) {
          if (!isExpectedAuthStatus(error.status)) {
            this.error.set(normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
          }
          this.cachedToken = null;
          return null;
        }

        this.error.set(undefined);
        this.cachedToken = data?.token ?? null;
        return this.cachedToken;
      })
      .catch((error: unknown) => {
        if (tokenGeneration !== this.tokenGeneration) {
          return null;
        }

        this.error.set(normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
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

  private getClient(): BetterAuthClientLike {
    this.client ??= this.clientFactory();
    return this.client;
  }

  private applySession(session: BetterAuthSessionData | null): void {
    this.sessionState.set(session);
    this.isAuthenticated.set(Boolean(session?.session));

    const nextSessionId = session?.session.id ?? null;
    if (this.lastSessionId !== nextSessionId) {
      this.lastSessionId = nextSessionId;
      this.tokenGeneration += 1;
      this.cachedToken = null;
      this.pendingToken = null;
      this.reauthVersion.update((version) => version + 1);
    }
  }
}
