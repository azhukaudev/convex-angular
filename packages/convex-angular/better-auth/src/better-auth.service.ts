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

function hasStringId(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

function isSessionData(value: unknown): value is BetterAuthSessionData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { session, user } = value as Partial<Record<'session' | 'user', unknown>>;
  return hasStringId(session) && hasStringId(user);
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
 * Better Auth session and Convex token state. Exposes `convexAuth` for
 * provideConvexAuth() wiring and backs injectBetterAuth().
 *
 * @internal
 */
@Injectable()
export class BetterAuthService {
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

  // What the latest exchange of this session produced: `undefined` until one
  // completes, `null` when it ended without a token (an error response, a
  // rejection, or an empty response), otherwise the token. Convex gives up on
  // auth after a `null` outcome and does not ask again until the next
  // setAuth(), so a same-session refreshSession() reads it to know it has to
  // re-register Convex auth.
  private cachedToken: string | null | undefined;
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
        result.error && isExpectedAuthStatus(result.error.status) ? null : (result.data ?? this.readCachedSession());
      this.applySession(sessionData);
      this.reauthAfterFailedExchange();
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

        // Only the request that's still current may write the shared cache or
        // the shared token error; a superseded (e.g. non-forced) request
        // resolving after a forced one must not clobber a fresher token that
        // already landed, nor rewrite the error state that came with it. Its
        // own caller still gets its own result.
        const isCurrent = this.pendingToken === request;
        const token = data?.token ?? null;

        if (error) {
          if (!isCurrent) {
            return null;
          }
          if (!isExpectedAuthStatus(error.status)) {
            this.setError('token', normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
          }
          this.cachedToken = null;
          return null;
        }

        if (isCurrent) {
          this.clearError('token');
          this.cachedToken = token;
        }
        return token;
      })
      .catch((error: unknown) => {
        // No generation guard here: `tokenGeneration` only changes in
        // applySession(), which clears `pendingToken` in the same block, so a
        // generation change already implies this request is no longer current.
        if (this.pendingToken === request) {
          this.setError('token', normalizeError(error, '[convex-angular better-auth] Convex token exchange failed'));
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

  /**
   * What provideConvexAuth() observes, deliberately narrower than this
   * service's public state: re-validating a session that is already known
   * must not look like "auth went back to loading", because Convex auth sync
   * answers that by clearing the client's auth and re-authenticating.
   * A session-id change still re-auths through reauthVersion.
   */
  readonly convexAuth: ConvexAuthProvider = {
    isLoading: computed(() => this.isLoading() && !this.isAuthenticated()),
    isAuthenticated: this.isAuthenticated,
    reauthVersion: this.reauthVersion,
    error: this.error,
    fetchAccessToken: this.fetchAccessToken,
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

  private readCachedSession(): BetterAuthSessionData | null {
    const cached = this.getClient().getSessionData?.();
    return isSessionData(cached) ? cached : null;
  }

  private applySession(session: BetterAuthSessionData | null): void {
    this.sessionState.set(session);
    this.isAuthenticated.set(Boolean(session?.session));

    const nextSessionId = session?.session.id ?? null;
    if (this.lastSessionId !== nextSessionId) {
      this.lastSessionId = nextSessionId;
      this.tokenGeneration += 1;
      this.cachedToken = undefined;
      this.pendingToken = null;
      this.reauthVersion.update((version) => version + 1);
    }
  }

  /**
   * A refresh that returns the same session deliberately leaves Convex alone
   * (see `convexAuth`), but Convex stops asking for tokens after a failed
   * exchange (`cachedToken === null`), so the only thing that can recover it
   * is a new setAuth(). Bump `reauthVersion` once in that case. A refresh that
   * changed the session already bumped it in applySession(), which also reset
   * `cachedToken`. Skipped while an exchange is still in flight: its outcome
   * is not known yet.
   */
  private reauthAfterFailedExchange(): void {
    if (this.cachedToken !== null || this.pendingToken !== null) {
      return;
    }
    this.cachedToken = undefined;
    this.reauthVersion.update((version) => version + 1);
  }
}
