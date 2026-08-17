import { Component, EnvironmentInjector, Injectable, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockAuthRegistration, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { injectAuth, provideConvexAuth, provideConvexAuthFromExisting } from './inject-auth';

@Injectable()
class ExistingAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly fetchAccessToken = jest.fn(async () => 'token');
}

function requireLastAuthRegistration(convex: MockConvexClient): MockAuthRegistration {
  const registration = convex.lastAuthRegistration();
  if (!registration) {
    throw new Error('Expected a captured auth registration');
  }
  return registration;
}

describe('injectAuth', () => {
  let convex: MockConvexClient;
  let fetchAccessToken: jest.MockedFunction<
    (opts: { forceRefreshToken: boolean }) => Promise<string | null | undefined>
  >;
  let providerLoading: ReturnType<typeof signal<boolean>>;
  let providerAuthenticated: ReturnType<typeof signal<boolean>>;
  let providerError: ReturnType<typeof signal<Error | undefined>>;
  let reauthVersion: ReturnType<typeof signal<number>>;

  function createProvider(): ConvexAuthProvider {
    return {
      isLoading: providerLoading,
      isAuthenticated: providerAuthenticated,
      error: providerError,
      reauthVersion,
      fetchAccessToken,
    };
  }

  function configureTestingModule(authProvider: ConvexAuthProvider = createProvider(), extraProviders: unknown[] = []) {
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
    providerLoading = signal(false);
    providerAuthenticated = signal(false);
    providerError = signal<Error | undefined>(undefined);
    reauthVersion = signal(0);
    fetchAccessToken = jest.fn().mockResolvedValue('token');

    convex = new MockConvexClient();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('exposes the current token and decoded claims via getAuth()', fakeAsync(() => {
    // The client only holds a token while the provider is signed in; a signed-out
    // provider makes the helper clear it before the assertion can read it back.
    providerAuthenticated.set(true);
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

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/Could not find Convex auth state/);
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

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/Could not find `CONVEX_AUTH`/);
  });

  it('throws when provideConvexAuth is configured without a Convex client', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX_AUTH, useValue: createProvider() }, provideConvexAuth()],
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
    configureTestingModule(createProvider(), [provideConvexAuth()]);

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
    providerLoading.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.isLoading()).toBe(true);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('waits for Convex confirmation when the provider is authenticated', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    expect(fixture.componentInstance.auth.isLoading()).toBe(true);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('does not wire Convex auth while the provider is still loading', fakeAsync(() => {
    providerLoading.set(true);
    providerAuthenticated.set(true);
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

    providerAuthenticated.set(true);

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.status()).toBe('unauthenticated');

    fixture.detectChanges();
    tick();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.status()).toBe('loading');

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.status()).toBe('authenticated');
  }));

  it('becomes authenticated only after Convex confirms the token', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isLoading()).toBe(false);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('becomes unauthenticated when Convex rejects the token', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isLoading()).toBe(false);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('enters the refreshing state while staying authenticated', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);

    requireLastAuthRegistration(convex).setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(true);
    expect(fixture.componentInstance.auth.status()).toBe('refreshing');
  }));

  it('returns to authenticated once the refresh completes', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    requireLastAuthRegistration(convex).setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    requireLastAuthRegistration(convex).setRefreshing(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('never reports refreshing while unauthenticated', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('clears the refreshing state when the provider signs out', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    requireLastAuthRegistration(convex).setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    providerAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('ignores refresh callbacks from a superseded auth generation', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const staleRegistration = requireLastAuthRegistration(convex);

    reauthVersion.update((value) => value + 1);
    tick();
    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    staleRegistration.setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isRefreshing()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('treats a null token as unauthenticated without setting an error', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockResolvedValue(null);
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    requireLastAuthRegistration(convex)
      .fetchToken({ forceRefreshToken: false })
      .then((value) => {
        token = value;
      });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('hands the provider token to Convex unchanged', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockResolvedValue('fresh-token');
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    requireLastAuthRegistration(convex)
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
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = requireLastAuthRegistration(convex);

    reauthVersion.update((value) => value + 1);
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
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = requireLastAuthRegistration(convex);

    reauthVersion.update((value) => value + 1);
    fixture.detectChanges();
    tick();

    fetchAccessToken.mockRejectedValue(new Error('stale provider exploded'));

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
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();
    const staleRegistration = requireLastAuthRegistration(convex);

    reauthVersion.update((value) => value + 1);
    fixture.detectChanges();
    tick();

    requireLastAuthRegistration(convex).setAuthenticated(true);
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
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    requireLastAuthRegistration(convex)
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
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue('provider rejected without an Error');
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider rejected without an Error',
      }),
    );
  }));

  it('clears the internal error once Convex confirms the token', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('keeps the internal error when Convex rejects the token', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    requireLastAuthRegistration(convex).setAuthenticated(false);
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

    providerError.set(providerFailure);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBe(providerFailure);

    providerError.set(undefined);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('shows the most recent active error across provider and internal failures', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();
    const providerFailure = new Error('provider failed');

    providerError.set(providerFailure);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBe(providerFailure);

    // Fault injection: the mock cannot arm a throwing `setAuth`.
    jest.spyOn(convex.client, 'setAuth').mockImplementation(() => {
      throw new Error('sync exploded');
    });

    reauthVersion.update((value) => value + 1);
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
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).fetchToken({ forceRefreshToken: false });
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.auth.error()).toEqual(
      expect.objectContaining({
        message: '[convex-angular auth] Token fetch failed: provider exploded',
      }),
    );

    fetchAccessToken.mockResolvedValue('fresh-token');
    reauthVersion.update((value) => value + 1);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('loading');
  }));

  it('clears auth and internal errors when the provider signs out', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).fetchToken({ forceRefreshToken: false });
    tick();

    // The client holds a token, so signing out has something to clear.
    convex.seedAuth({ token: 'live-token', decoded: {} });
    providerAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(convex.clearAuthCount).toBeGreaterThan(0);
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('leaves the Convex client alone when it holds no auth', fakeAsync(() => {
    providerAuthenticated.set(true);
    // No token: the helper should consult hasAuth and decline to clear.
    convex.seedAuth(undefined);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    providerAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(convex.hasAuthCount).toBeGreaterThan(0);
    expect(convex.clearAuthCount).toBe(0);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('records an internal error when clearing Convex auth fails', fakeAsync(() => {
    // Fault injection: the mock cannot arm a throwing `hasAuth`.
    jest.spyOn(convex.client, 'hasAuth').mockImplementation(() => {
      throw new Error('socket closed');
    });
    providerLoading.set(true);
    providerAuthenticated.set(true);
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
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    // The client holds a token, so teardown has something to clear.
    convex.seedAuth({ token: 'live-token', decoded: {} });
    TestBed.resetTestingModule();

    expect(convex.clearAuthCount).toBe(1);
  }));

  it('does not report a refresh after the auth state is torn down', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    requireLastAuthRegistration(convex).setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const auth = fixture.componentInstance.auth;
    expect(auth.status()).toBe('authenticated');

    TestBed.resetTestingModule();

    expect(auth.isRefreshing()).toBe(false);
    expect(auth.status()).toBe('authenticated');
  }));

  it('does not surface a sync failure raised after the auth state was destroyed', fakeAsync(() => {
    providerAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), { provide: CONVEX_AUTH, useValue: createProvider() }],
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
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();
    const firstRegistration = requireLastAuthRegistration(convex);

    reauthVersion.update((value) => value + 1);
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
    providerAuthenticated.set(true);
    configureTestingModule();

    createAuthFixture();
    expect(convex.authRegistrations).toHaveLength(1);

    reauthVersion.update((value) => value + 1);
    tick();

    expect(convex.authRegistrations).toHaveLength(2);
  }));

  it('returns the same auth state object for repeated calls in the same injector', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const injector = TestBed.inject(EnvironmentInjector);
    const authA = injectAuth({ injectRef: injector });
    const authB = injectAuth({ injectRef: injector });
    tick();

    expect(authA).toBe(authB);
    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('reuses the root auth state across child injectors and does not clear auth on child destroy', fakeAsync(() => {
    providerAuthenticated.set(true);
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
      providerLoading.set(true);
      configureTestingModule();

      const fixture = createAuthFixture();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
    }));

    it('does not record an internal error once the provider settles unauthenticated', fakeAsync(() => {
      providerLoading.set(false);
      providerAuthenticated.set(false);
      configureTestingModule();

      const fixture = createAuthFixture();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    }));

    it('does not wire Convex auth or record an error once the provider is authenticated', fakeAsync(() => {
      providerAuthenticated.set(true);
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

describe('provideConvexAuthFromExisting', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('reuses the existing auth provider instance', fakeAsync(() => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
      ],
    });

    const existingProvider = TestBed.inject(ExistingAuthProvider);
    const providerViaToken = TestBed.inject(CONVEX_AUTH);

    expect(providerViaToken).toBe(existingProvider);

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

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');

    existingProvider.isAuthenticated.set(true);
    fixture.detectChanges();
    tick();

    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('throws when combined with provideConvexAuth in the same injector', () => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/registered more than once in the same injector/);
  });

  it('throws when registered in a child injector after parent auth is configured', () => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
      ],
    });

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() =>
      createEnvironmentInjector(
        [ExistingAuthProvider, provideConvexAuthFromExisting(ExistingAuthProvider)],
        rootInjector,
      ),
    ).toThrow(/must be configured only in your root application providers/);
  });
});
