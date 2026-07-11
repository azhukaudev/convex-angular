import { isPlatformServer } from '@angular/common';
import { Injectable, InjectionToken, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { ConvexAuthProvider } from 'convex-angular';

import { BetterAuthClientLike, BetterAuthSessionData } from './better-auth-client';

/**
 * Factory producing the consumer's Better Auth client. Registered by
 * provideBetterAuth(); invoked lazily and only in the browser.
 *
 * @internal
 */
export const BETTER_AUTH_CLIENT_FACTORY = new InjectionToken<() => BetterAuthClientLike>('BETTER_AUTH_CLIENT_FACTORY');

/** One of the two independent failure sources tracked by BetterAuthService's `error`. */
type BetterAuthErrorSource = 'session' | 'token';

/** An error tagged with a monotonic sequence, so the most recent of two sources can win. */
interface SequencedBetterAuthError {
  error: Error;
  sequence: number;
}

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
  readonly reauthVersion = signal(0);

  // Session and token failures are tracked independently (each tagged with a
  // shared monotonic sequence) so a successful exchange on one path can't
  // silently clear a genuine failure still standing on the other.
  private readonly sessionErrorState = signal<SequencedBetterAuthError | undefined>(undefined);
  private readonly tokenErrorState = signal<SequencedBetterAuthError | undefined>(undefined);
  private errorSequence = 0;

  /** The most recent unexpected session or token-exchange failure. */
  readonly error = computed<Error | undefined>(() => {
    const session = this.sessionErrorState();
    const token = this.tokenErrorState();

    if (!session) {
      return token?.error;
    }
    if (!token) {
      return session.error;
    }
    return session.sequence >= token.sequence ? session.error : token.error;
  });

  private cachedToken: string | null = null;
  private pendingToken: Promise<string | null> | null = null;
  private lastSessionId: string | null = null;
  private tokenGeneration = 0;
  private sessionEpoch = 0;

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

    // Captured so a superseded refresh (a sign-out, or a later overlapping
    // refresh) can detect it's stale and bail before applying its result.
    const epoch = ++this.sessionEpoch;
    this.isLoading.set(true);

    try {
      const result = await this.getClient().getSession({ fetchOptions: { throw: false } });
      if (epoch !== this.sessionEpoch) {
        return;
      }

      if (result.error && !isExpectedAuthStatus(result.error.status)) {
        this.setError('session', normalizeError(result.error, '[convex-angular better-auth] Session refresh failed'));
      } else {
        this.clearError('session');
      }

      // The cross-domain plugin's getSessionData() cache is only written on a
      // successful (2xx) get-session response, so on an expected auth
      // rejection (401/403) it can still hold a stale, now-invalid session.
      // Skip the fallback in that case; keep it for the no-error-no-data case.
      const sessionData =
        result.error && isExpectedAuthStatus(result.error.status)
          ? null
          : (result.data ?? this.getClient().getSessionData?.() ?? null);
      this.applySession(sessionData);
    } catch (error) {
      if (epoch !== this.sessionEpoch) {
        return;
      }
      this.setError('session', normalizeError(error, '[convex-angular better-auth] Session refresh failed'));
      this.applySession(null);
    } finally {
      if (epoch === this.sessionEpoch) {
        this.isLoading.set(false);
      }
    }
  }

  /**
   * Mark the user signed out locally: clears the session snapshot, the token
   * cache, and notifies the client's session listeners.
   */
  clearSession(): void {
    // Bump the epoch first so a refreshSession() already in flight discards
    // its result instead of reverting this sign-out when it resolves.
    this.sessionEpoch += 1;
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

        // Only the request that's still current may write the shared cache;
        // a superseded (e.g. non-forced) request resolving after a forced one
        // must not clobber a fresher token that already landed.
        const isCurrent = this.pendingToken === request;
        const token = data?.token ?? null;

        if (error) {
          if (!isExpectedAuthStatus(error.status)) {
            this.setError('token', normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
          }
          if (isCurrent) {
            this.cachedToken = null;
          }
          return null;
        }

        this.clearError('token');
        if (isCurrent) {
          this.cachedToken = token;
        }
        return token;
      })
      .catch((error: unknown) => {
        if (tokenGeneration !== this.tokenGeneration) {
          return null;
        }

        this.setError('token', normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
        if (this.pendingToken === request) {
          this.cachedToken = null;
        }
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

  private setError(source: BetterAuthErrorSource, error: Error): void {
    const state = source === 'session' ? this.sessionErrorState : this.tokenErrorState;
    state.set({ error, sequence: ++this.errorSequence });
  }

  private clearError(source: BetterAuthErrorSource): void {
    const state = source === 'session' ? this.sessionErrorState : this.tokenErrorState;
    state.set(undefined);
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
