import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexAuthProvider, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { injectAuth, provideConvexAuth } from './inject-auth';

const AUTH_SETUP_HELPERS = [
  'provideClerkAuth()',
  'provideAuth0Auth()',
  'provideBetterAuth()',
  'provideConvexAuthFromExisting()',
];

function captureThrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}

describe('injectAuth', () => {
  let convex: MockConvexClient;
  let provider: MockConvexAuthProvider;
  // Kept only for the two tests below that need jest.fn assertions or a
  // non-Error rejection value the double's typed `failNextFetch(error: Error)`
  // cannot express — see 'hands the provider token to Convex unchanged' and
  // 'records non-Error token fetch failures with their string form'.
  let fetchAccessToken: jest.MockedFunction<
    (opts: { forceRefreshToken: boolean }) => Promise<string | null | undefined>
  >;
  let providerAuthenticated: ReturnType<typeof signal<boolean>>;

  function createProvider(): ConvexAuthProvider {
    return {
      isLoading: signal(false),
      isAuthenticated: providerAuthenticated,
      error: signal<Error | undefined>(undefined),
      reauthVersion: signal(0),
      fetchAccessToken,
    };
  }

  function configureTestingModule(authProvider: ConvexAuthProvider = provider, extraProviders: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        { provide: CONVEX_AUTH, useValue: authProvider },
        provideConvexAuth(),
        ...extraProviders,
      ],
    });
  }

  function createAuthFixture() {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();
    return fixture;
  }

  beforeEach(() => {
    providerAuthenticated = signal(false);
    fetchAccessToken = jest.fn().mockResolvedValue('token');

    convex = new MockConvexClient();
    provider = new MockConvexAuthProvider();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('exposes the current token and decoded claims via getAuth()', fakeAsync(() => {
    // The client only holds a token while the provider is signed in; a signed-out
    // provider makes the helper clear it before the assertion can read it back.
    provider.signIn();
    const authSnapshot = { token: 'jwt-token', decoded: { sub: 'user-1' } };
    convex.seedAuth(authSnapshot);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.getAuth()).toEqual(authSnapshot);
  }));

  it('returns undefined from getAuth() when no token is set', fakeAsync(() => {
    convex.seedAuth(undefined);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.getAuth()).toBeUndefined();
  }));

  it('throws when auth state providers are not configured', () => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex)],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const { message } = captureThrown(() => TestBed.createComponent(TestComponent));
    expect(message).toMatch(/Could not find Convex auth state/);
    for (const helper of AUTH_SETUP_HELPERS) {
      expect(message).toContain(helper);
    }
    expect(message).toMatch(/ in your application providers\.$/);
  });

  it('throws when provideConvexAuth is configured without CONVEX_AUTH', () => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), provideConvexAuth()],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const { message } = captureThrown(() => TestBed.createComponent(TestComponent));
    expect(message).toMatch(/Could not find `CONVEX_AUTH`/);
    for (const helper of AUTH_SETUP_HELPERS) {
      expect(message).toContain(helper);
    }
    expect(message).toMatch(/`provideConvexAuthFromExisting\(\)`\.$/);
  });

  it('throws when provideConvexAuth is configured without a Convex client', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX_AUTH, useValue: provider }, provideConvexAuth()],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(
      /once in your root application providers before calling/,
    );
  });

  it('throws when provideConvexAuth is registered multiple times in one injector', () => {
    configureTestingModule(provider, [provideConvexAuth()]);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(
      /registered more than once in the same injector\. Register it exactly once in your root application providers/,
    );
  });

  it('throws when provideConvexAuth is registered in a child injector', () => {
    configureTestingModule();

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() => createEnvironmentInjector([provideConvexAuth()], rootInjector)).toThrow(
      /must be configured only in your root application providers.*Remove nested or route-level registrations/,
    );
  });

  it('is loading while the auth provider is loading', fakeAsync(() => {
    provider.setLoading(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.isLoading()).toBe(true);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('waits for Convex confirmation when the provider is authenticated', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.isLoading()).toBe(true);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('does not wire Convex auth while the provider is still loading', fakeAsync(() => {
    provider.signIn();
    provider.setLoading(true);
    // A token from a previous session is what makes the clear meaningful.
    convex.seedAuth({ token: 'previous-session-token', decoded: {} });
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(convex.authRegistrations).toHaveLength(0);
    expect(convex.clearAuthCount).toBe(1);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('does not report authenticated before the sync effect observes a provider sign-in', fakeAsync(() => {
    configureTestingModule();

    const fixture = createAuthFixture();
    const auth = fixture.componentInstance.auth;

    expect(auth.status()).toBe('unauthenticated');

    provider.signIn();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.status()).toBe('unauthenticated');

    fixture.detectChanges();
    tick();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.status()).toBe('loading');

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.status()).toBe('authenticated');
  }));

  it('becomes authenticated only after Convex confirms the token', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isLoading()).toBe(false);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('becomes unauthenticated when Convex rejects the token', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isLoading()).toBe(false);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('enters the refreshing state while staying authenticated', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);

    convex.requireLastAuthRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(true);
    expect(fixture.componentInstance.auth.status()).toBe('refreshing');
  }));

  it('returns to authenticated once the refresh completes', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    convex.requireLastAuthRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    convex.requireLastAuthRegistration().setRefreshing(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('never reports refreshing while unauthenticated', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('clears the refreshing state when the provider signs out', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    convex.requireLastAuthRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    provider.signOut();
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('ignores refresh callbacks from a superseded auth generation', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const staleRegistration = convex.requireLastAuthRegistration();

    provider.bumpReauth();
    tick();
    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    staleRegistration.setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('keeps loading after an empty non-forced token fetch until Convex decides', fakeAsync(() => {
    provider.signIn();
    provider.token = null;
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    convex
      .requireLastAuthRegistration()
      .fetchToken({ forceRefreshToken: false })
      .then((value) => {
        token = value;
      });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.status()).toBe('loading');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();

    convex.requireLastAuthRegistration().setAuthenticated(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('treats an empty forced token fetch as unauthenticated without setting an error', fakeAsync(() => {
    provider.signIn();
    provider.token = null;
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    convex
      .requireLastAuthRegistration()
      .fetchToken({ forceRefreshToken: true })
      .then((value) => {
        token = value;
      });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('keeps loading when the non-forced token fetch throws, and records the error', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    void convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.status()).toBe('loading');
    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({ message: '[convex-angular auth] Token fetch failed: provider exploded' }),
    );
  }));

  it('goes from loading straight to authenticated when the forced retry returns a token', fakeAsync(() => {
    const statuses: string[] = [];
    provider.signIn();
    provider.token = null;
    configureTestingModule();
    const fixture = createAuthFixture();
    const auth = fixture.componentInstance.auth;
    const registration = convex.requireLastAuthRegistration();
    statuses.push(auth.status());

    void registration.fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();
    statuses.push(auth.status());

    provider.token = 'fresh-token';
    let retried: string | null | undefined;
    void registration.fetchToken({ forceRefreshToken: true }).then((value) => (retried = value));
    tick();
    fixture.detectChanges();
    statuses.push(auth.status());

    registration.setAuthenticated(true);
    fixture.detectChanges();
    tick();
    statuses.push(auth.status());

    expect(retried).toBe('fresh-token');
    expect(statuses).toEqual(['loading', 'loading', 'loading', 'authenticated']);
  }));

  it('still reports unauthenticated at once when the client already held a token', fakeAsync(() => {
    provider.signIn();
    provider.token = null;
    convex.seedAuth({ token: 'held-token', decoded: {} });
    configureTestingModule();
    const fixture = createAuthFixture();

    void convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('hands the provider token to Convex unchanged', fakeAsync(() => {
    // Kept on the createProvider() literal: asserts with `toHaveBeenCalledWith`,
    // which needs a jest.fn, not the double's `fetchCalls` record.
    providerAuthenticated.set(true);
    fetchAccessToken.mockResolvedValue('fresh-token');
    configureTestingModule(createProvider());

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    convex
      .requireLastAuthRegistration()
      .fetchToken({ forceRefreshToken: false })
      .then((value) => {
        token = value;
      });
    tick();
    fixture.detectChanges();

    expect(fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: false });
    expect(token).toBe('fresh-token');
    expect(fixture.componentInstance.auth.status()).toBe('loading');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('discards a token resolved for a superseded auth generation', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = convex.requireLastAuthRegistration();

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    let token: string | null | undefined = 'unresolved';
    staleRegistration.fetchToken({ forceRefreshToken: false }).then((value) => {
      token = value;
    });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('ignores a token fetch failure from a superseded auth generation', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = convex.requireLastAuthRegistration();

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    provider.failNextFetch(new Error('stale provider exploded'));

    let token: string | null | undefined = 'unresolved';
    staleRegistration.fetchToken({ forceRefreshToken: true }).then((value) => {
      token = value;
    });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('ignores auth confirmations from a superseded auth generation', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = convex.requireLastAuthRegistration();

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');

    staleRegistration.setAuthenticated(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('records token fetch failures as ordinary Error objects', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    convex
      .requireLastAuthRegistration()
      .fetchToken({ forceRefreshToken: true })
      .then((value) => {
        token = value;
      });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );
  }));

  it('records non-Error token fetch failures with their string form', fakeAsync(() => {
    // Kept on the createProvider() literal: a non-Error rejection value is not
    // expressible through the double's typed `failNextFetch(error: Error)`.
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue('provider rejected without an Error');
    configureTestingModule(createProvider());

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider rejected without an Error',
      }),
    );
  }));

  it('clears the internal error once Convex confirms the token', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('keeps the internal error when Convex rejects the token', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    convex.requireLastAuthRegistration().setAuthenticated(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('mirrors provider errors until they clear', fakeAsync(() => {
    configureTestingModule();

    const fixture = createAuthFixture();
    const providerFailure = new Error('upstream failed');

    provider.setError(providerFailure);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBe(providerFailure);

    provider.setError(undefined);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('shows the most recent active error across provider and internal failures', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();
    const providerFailure = new Error('provider failed');

    provider.setError(providerFailure);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBe(providerFailure);

    // Fault injection: the mock cannot arm a throwing `setAuth`.
    jest.spyOn(convex.client, 'setAuth').mockImplementation(() => {
      throw new Error('sync exploded');
    });

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Convex auth sync failed: sync exploded',
      }),
    );
  }));

  it('clears internal errors when the next auth attempt starts', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('clears auth and internal errors when the provider signs out', fakeAsync(() => {
    provider.signIn();
    provider.failNextFetch(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
    tick();

    // The client holds a token, so signing out has something to clear.
    convex.seedAuth({ token: 'live-token', decoded: {} });
    provider.signOut();
    fixture.detectChanges();
    tick();

    expect(convex.clearAuthCount).toBeGreaterThan(0);
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('leaves the Convex client alone when it holds no auth', fakeAsync(() => {
    provider.signIn();
    // No token: the helper should consult hasAuth and decline to clear.
    convex.seedAuth(undefined);
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    // The signed-in setup already read hasAuth; only a further read proves sign-out looked.
    const hasAuthCountBeforeSignOut = convex.hasAuthCount;
    provider.signOut();
    fixture.detectChanges();
    tick();

    expect(convex.hasAuthCount).toBeGreaterThan(hasAuthCountBeforeSignOut);
    expect(convex.clearAuthCount).toBe(0);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('records an internal error when clearing Convex auth fails', fakeAsync(() => {
    // Fault injection: the mock cannot arm a throwing `hasAuth`.
    jest.spyOn(convex.client, 'hasAuth').mockImplementation(() => {
      throw new Error('socket closed');
    });
    provider.signIn();
    provider.setLoading(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Convex auth sync failed: socket closed',
      }),
    );
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('clears Convex auth when the auth state is torn down', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    // The client holds a token, so teardown has something to clear.
    convex.seedAuth({ token: 'live-token', decoded: {} });
    TestBed.resetTestingModule();

    expect(convex.clearAuthCount).toBe(1);
  }));

  it('does not report a refresh after the auth state is torn down', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const auth = fixture.componentInstance.auth;
    expect(auth.status()).toBe('authenticated');

    TestBed.resetTestingModule();

    expect(auth.isRefreshing()).toBe(false);
    expect(auth.status()).toBe('authenticated');
  }));

  it('does not surface a sync failure raised after the auth state was destroyed', fakeAsync(() => {
    provider.signIn();
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), { provide: CONVEX_AUTH, useValue: provider }],
    });

    const rootInjector = TestBed.inject(EnvironmentInjector);
    const authInjector = createEnvironmentInjector([provideConvexAuth()], rootInjector);
    // Fault injection: the mock cannot arm a throwing `setAuth`. Stubbing it
    // also suppresses the recorded registration, hence the spy call count.
    const setAuth = jest.spyOn(convex.client, 'setAuth').mockImplementation(() => {
      authInjector.destroy();
      throw new Error('sync exploded');
    });

    const auth = injectAuth({ injectRef: authInjector });

    TestBed.tick();
    tick();

    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(auth.error()).toBeUndefined();
    expect(auth.status()).toBe('loading');
  }));

  it('ignores callbacks from every superseded generation after teardown', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const fixture = createAuthFixture();
    const firstRegistration = convex.requireLastAuthRegistration();

    provider.bumpReauth();
    fixture.detectChanges();
    tick();

    expect(convex.authRegistrations).toHaveLength(2);

    const auth = fixture.componentInstance.auth;
    TestBed.resetTestingModule();

    firstRegistration.setAuthenticated(true);

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.status()).toBe('loading');
  }));

  it('re-runs auth when reauthVersion changes while signed in', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    createAuthFixture();
    expect(convex.authRegistrations).toHaveLength(1);

    provider.bumpReauth();
    tick();

    expect(convex.authRegistrations).toHaveLength(2);
  }));

  it('does not track signals the provider reads while Convex fetches the first token', fakeAsync(() => {
    const audience = signal('first');
    const readingProvider: ConvexAuthProvider = {
      isLoading: signal(false),
      isAuthenticated: signal(true),
      error: signal<Error | undefined>(undefined),
      // Reads a signal before its first await, as Clerk's sessionAudience check does.
      fetchAccessToken: async () => {
        audience();
        return 'token';
      },
    };
    // The real client calls fetchToken synchronously inside setAuth
    // (AuthenticationManager.setConfig); the mock only records the call.
    const recordSetAuth = convex.client.setAuth;
    jest.spyOn(convex.client, 'setAuth').mockImplementation((fetchToken, onChange, onRefreshChange) => {
      recordSetAuth(fetchToken, onChange, onRefreshChange);
      void fetchToken({ forceRefreshToken: false });
    });
    configureTestingModule(readingProvider);

    createAuthFixture();
    expect(convex.authRegistrations).toHaveLength(1);

    audience.set('second');
    tick();

    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('returns the same auth state object for repeated calls in the same injector', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const injector = TestBed.inject(EnvironmentInjector);
    const authA = injectAuth({ injectRef: injector });
    const authB = injectAuth({ injectRef: injector });
    tick();

    expect(authA).toBe(authB);
    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('reuses the root auth state across child injectors and does not clear auth on child destroy', fakeAsync(() => {
    provider.signIn();
    configureTestingModule();

    const rootInjector = TestBed.inject(EnvironmentInjector);
    const childInjector = createEnvironmentInjector([], rootInjector);

    const rootAuth = injectAuth({ injectRef: rootInjector });
    const childAuth = injectAuth({ injectRef: childInjector });
    tick();

    expect(childAuth).toBe(rootAuth);
    expect(convex.authRegistrations).toHaveLength(1);

    // The client holds a token, so a child destroy that wrongly tore down the
    // root auth state would have something to clear and would be caught.
    convex.seedAuth({ token: 'live-token', decoded: {} });
    childInjector.destroy();

    expect(convex.clearAuthCount).toBe(0);
  }));

  describe('disabled client (SSR)', () => {
    beforeEach(() => {
      convex = new MockConvexClient({ disabled: true });
    });

    it('does not record an internal error while the provider is loading', fakeAsync(() => {
      provider.setLoading(true);
      configureTestingModule();

      const fixture = createAuthFixture();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
    }));

    it('does not record an internal error once the provider settles unauthenticated', fakeAsync(() => {
      configureTestingModule();

      const fixture = createAuthFixture();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    }));

    it('does not wire Convex auth or record an error once the provider is authenticated', fakeAsync(() => {
      provider.signIn();
      configureTestingModule();

      const fixture = createAuthFixture();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
      expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
      expect(fixture.componentInstance.auth.status()).toBe('loading');
    }));

    it('does not record an internal error when the auth state is destroyed', fakeAsync(() => {
      configureTestingModule();
      const fixture = createAuthFixture();
      const auth = fixture.componentInstance.auth;

      TestBed.resetTestingModule();

      expect(auth.error()).toBeUndefined();
    }));
  });
});
