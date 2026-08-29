import { EnvironmentProviders, Signal, WritableSignal, makeEnvironmentProviders, signal } from '@angular/core';
import { AuthTokenFetcher, CONVEX_AUTH, ConvexAuthProvider, provideConvexAuth } from 'convex-angular';

/**
 * Options for {@link MockConvexAuthProvider}.
 *
 * @public
 */
export interface MockConvexAuthProviderOptions {
  /** Start already authenticated. Defaults to `false` (signed out). */
  initiallyAuthenticated?: boolean;
  /** The token `fetchAccessToken` resolves while signed in. Defaults to `'test-token'`. */
  token?: string | null;
  /** Start in the loading state. Defaults to `false`. */
  initiallyLoading?: boolean;
}

/**
 * A driveable {@link ConvexAuthProvider} double for tests.
 *
 * Plays the identity-provider side of the auth handshake — Clerk, Auth0,
 * Better Auth, or your own session service. `MockAuthRegistration` (from
 * `convex.lastAuthRegistration()`) remains Convex's side of that handshake;
 * this class only ever answers `isLoading` / `isAuthenticated` /
 * `fetchAccessToken` the way the identity provider would.
 *
 * Deliberately inert: nothing here ever flips its own state. There is no
 * auto-sign-in when `fetchAccessToken` is called and no reaction to what
 * Convex decides — the test drives every transition with `setLoading()`,
 * `signIn()`, `signOut()`, `setError()`, `bumpReauth()`, and `failNextFetch()`.
 * That is what keeps the two-sided handshake testable: a double that guessed
 * at Convex's side would hide the very races these tests exist to catch.
 *
 * @example
 * ```typescript
 * const provider = new MockConvexAuthProvider();
 * TestBed.configureTestingModule({
 *   providers: [provideConvexTesting(convex), provideConvexAuthTesting(provider)],
 * });
 *
 * provider.signIn();
 * // ... Convex has not confirmed yet, so injectAuth() is still 'loading' ...
 * convex.lastAuthRegistration()!.setAuthenticated(true);
 * ```
 *
 * @public
 */
export class MockConvexAuthProvider implements ConvexAuthProvider {
  private readonly loadingSignal: WritableSignal<boolean>;
  private readonly authenticatedSignal: WritableSignal<boolean>;
  private readonly errorSignal: WritableSignal<Error | undefined>;
  private readonly reauthVersionSignal: WritableSignal<number>;
  private readonly recordedFetchCalls: Array<{ forceRefreshToken: boolean }> = [];
  private pendingFailure: Error | undefined = undefined;

  /** Whether the identity provider is still loading its initial state. */
  readonly isLoading: Signal<boolean>;
  /** Whether the identity provider reports the user as signed in. */
  readonly isAuthenticated: Signal<boolean>;
  /** The provider-owned error, if any. Set with {@link MockConvexAuthProvider.setError}. */
  readonly error: Signal<Error | undefined>;
  /** Bumped by {@link MockConvexAuthProvider.bumpReauth} to force Convex to rerun auth setup. */
  readonly reauthVersion: Signal<number>;

  /**
   * The token `fetchAccessToken` resolves while signed in. Assignable
   * directly; `signIn(token)` sets it and `signOut()` clears it to `null`.
   */
  token: string | null;

  constructor(options: MockConvexAuthProviderOptions = {}) {
    this.loadingSignal = signal(options.initiallyLoading ?? false);
    this.authenticatedSignal = signal(options.initiallyAuthenticated ?? false);
    this.errorSignal = signal<Error | undefined>(undefined);
    this.reauthVersionSignal = signal(0);
    this.isLoading = this.loadingSignal.asReadonly();
    this.isAuthenticated = this.authenticatedSignal.asReadonly();
    this.error = this.errorSignal.asReadonly();
    this.reauthVersion = this.reauthVersionSignal.asReadonly();
    this.token = options.token === undefined ? 'test-token' : options.token;
  }

  /** Every `fetchAccessToken` call this double has recorded, oldest first. */
  get fetchCalls(): ReadonlyArray<{ forceRefreshToken: boolean }> {
    return this.recordedFetchCalls;
  }

  /** Set whether the identity provider is still loading. */
  setLoading(isLoading: boolean): void {
    this.loadingSignal.set(isLoading);
  }

  /** Sign in: sets `token` (if given), `isAuthenticated` to `true`, and `isLoading` to `false`. */
  signIn(token?: string): void {
    if (token !== undefined) {
      this.token = token;
    }
    this.authenticatedSignal.set(true);
    this.loadingSignal.set(false);
  }

  /** Sign out: clears `token` to `null` and sets `isAuthenticated` to `false`. */
  signOut(): void {
    this.token = null;
    this.authenticatedSignal.set(false);
  }

  /** Set (or clear) the provider-owned error signal. */
  setError(error: Error | undefined): void {
    this.errorSignal.set(error);
  }

  /** Force Convex to rerun auth setup, as an organization switch or similar context change would. */
  bumpReauth(): void {
    this.reauthVersionSignal.update((value) => value + 1);
  }

  /** Make the next `fetchAccessToken` call reject with `error`, exactly once; later calls resolve normally again. */
  failNextFetch(error: Error): void {
    this.pendingFailure = error;
  }

  /** Resolves {@link MockConvexAuthProvider.token} and records the call; see {@link MockConvexAuthProvider.failNextFetch}. */
  fetchAccessToken: AuthTokenFetcher = async ({ forceRefreshToken }) => {
    this.recordedFetchCalls.push({ forceRefreshToken });
    if (this.pendingFailure) {
      const error = this.pendingFailure;
      this.pendingFailure = undefined;
      throw error;
    }
    return this.token;
  };
}

/**
 * Registers a {@link MockConvexAuthProvider} under `CONVEX_AUTH` and calls
 * `provideConvexAuth()`.
 *
 * Composing this with another `provideConvexAuth()` call in the same
 * environment injector triggers the library's existing duplicate-registration
 * error, by design — auth must be registered exactly once, in tests as in
 * production.
 *
 * @example
 * ```typescript
 * const provider = new MockConvexAuthProvider();
 * TestBed.configureTestingModule({
 *   providers: [provideConvexTesting(convex), provideConvexAuthTesting(provider)],
 * });
 * ```
 *
 * @param provider - The double the test drives; defaults to a fresh one
 * @returns EnvironmentProviders registering the mock under CONVEX_AUTH
 *
 * @public
 */
export function provideConvexAuthTesting(
  provider: MockConvexAuthProvider = new MockConvexAuthProvider(),
): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CONVEX_AUTH, useValue: provider }, provideConvexAuth()]);
}
