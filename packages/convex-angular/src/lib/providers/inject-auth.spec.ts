import { Component, EnvironmentInjector, Injectable, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { CONVEX } from '../tokens/convex';
import { injectAuth, provideConvexAuth, provideConvexAuthFromExisting } from './inject-auth';

@Injectable()
class ExistingAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly fetchAccessToken = jest.fn(async () => 'token');
}

describe('injectAuth', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let mockClearAuth: jest.Mock;
  let mockHasAuth: jest.Mock;
  let fetchAccessToken: jest.Mock<Promise<string | null | undefined>, [{ forceRefreshToken: boolean }]>;
  let providerLoading: ReturnType<typeof signal<boolean>>;
  let providerAuthenticated: ReturnType<typeof signal<boolean>>;
  let providerError: ReturnType<typeof signal<Error | undefined>>;
  let reauthVersion: ReturnType<typeof signal<number>>;
  let setAuthFetcher: ((args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>) | undefined;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

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
        { provide: CONVEX, useValue: mockConvexClient },
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
    setAuthFetcher = undefined;
    setAuthOnChange = undefined;

    mockSetAuth = jest.fn((fetchToken, onChange) => {
      setAuthFetcher = fetchToken;
      setAuthOnChange = onChange;
    });
    mockClearAuth = jest.fn();
    mockHasAuth = jest.fn().mockReturnValue(false);

    mockConvexClient = {
      setAuth: mockSetAuth,
      client: {
        clearAuth: mockClearAuth,
        hasAuth: mockHasAuth,
      },
    } as unknown as jest.Mocked<ConvexClient>;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('throws when auth state providers are not configured', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
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
      providers: [{ provide: CONVEX, useValue: mockConvexClient }, provideConvexAuth()],
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

  it('throws when provideConvexAuth is registered multiple times in one injector', () => {
    configureTestingModule(createProvider(), [provideConvexAuth()]);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/registered more than once in the same injector/);
  });

  it('throws when provideConvexAuth is registered in a child injector', () => {
    configureTestingModule();

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() => createEnvironmentInjector([provideConvexAuth()], rootInjector)).toThrow(
      /must be configured only in your root application providers/,
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
    expect(mockSetAuth).toHaveBeenCalledTimes(1);
  }));

  it('becomes authenticated only after Convex confirms the token', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const fixture = createAuthFixture();

    setAuthOnChange?.(true);
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

    setAuthOnChange?.(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.isLoading()).toBe(false);
    expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('treats a null token as unauthenticated without setting an error', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockResolvedValue(null);
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    setAuthFetcher?.({ forceRefreshToken: false }).then((value) => {
      token = value;
    });
    tick();
    fixture.detectChanges();

    expect(token).toBeNull();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
  }));

  it('records token fetch failures as ordinary Error objects', fakeAsync(() => {
    providerAuthenticated.set(true);
    fetchAccessToken.mockRejectedValue(new Error('provider exploded'));
    configureTestingModule();

    const fixture = createAuthFixture();

    let token: string | null | undefined;
    setAuthFetcher?.({ forceRefreshToken: true }).then((value) => {
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

    mockSetAuth.mockImplementation(() => {
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

    setAuthFetcher?.({ forceRefreshToken: false });
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

    setAuthFetcher?.({ forceRefreshToken: false });
    tick();

    mockHasAuth.mockReturnValue(true);
    providerAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(mockClearAuth).toHaveBeenCalled();
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('re-runs auth when reauthVersion changes while signed in', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    createAuthFixture();
    expect(mockSetAuth).toHaveBeenCalledTimes(1);

    reauthVersion.update((value) => value + 1);
    tick();

    expect(mockSetAuth).toHaveBeenCalledTimes(2);
  }));

  it('clears existing Convex auth before reauthenticating an authenticated context change', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    createAuthFixture();
    setAuthOnChange?.(true);
    tick();

    mockHasAuth.mockReturnValue(true);

    reauthVersion.update((value) => value + 1);
    tick();

    expect(mockClearAuth).toHaveBeenCalledTimes(1);
    expect(mockSetAuth).toHaveBeenCalledTimes(2);
    expect(mockClearAuth.mock.invocationCallOrder[0]).toBeLessThan(mockSetAuth.mock.invocationCallOrder[1]);
  }));

  it('returns the same auth state object for repeated calls in the same injector', fakeAsync(() => {
    providerAuthenticated.set(true);
    configureTestingModule();

    const injector = TestBed.inject(EnvironmentInjector);
    const authA = injectAuth({ injectRef: injector });
    const authB = injectAuth({ injectRef: injector });
    tick();

    expect(authA).toBe(authB);
    expect(mockSetAuth).toHaveBeenCalledTimes(1);
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
    expect(mockSetAuth).toHaveBeenCalledTimes(1);

    mockHasAuth.mockReturnValue(true);
    childInjector.destroy();

    expect(mockClearAuth).not.toHaveBeenCalled();
  }));
});

describe('provideConvexAuthFromExisting', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('reuses the existing auth provider instance', fakeAsync(() => {
    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
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

    expect(mockConvexClient.setAuth).toHaveBeenCalledTimes(1);
  }));

  it('throws when combined with provideConvexAuth in the same injector', () => {
    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
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
    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
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
