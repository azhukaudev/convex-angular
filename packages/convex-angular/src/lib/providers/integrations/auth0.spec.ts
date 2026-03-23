import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX_AUTH } from '../../tokens/auth';
import { CONVEX } from '../../tokens/convex';
import { injectAuth, provideConvexAuth } from '../inject-auth';
import { AUTH0_AUTH, Auth0AuthProvider, Auth0TokenResponse, provideAuth0Auth } from './auth0';

describe('provideAuth0Auth', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let mockClearAuth: jest.Mock;
  let mockHasAuth: jest.Mock;
  let setAuthFetcher: ((args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>) | undefined;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

  let isLoading: ReturnType<typeof signal<boolean>>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let error: ReturnType<typeof signal<Error | undefined>>;
  let getAccessTokenSilently: jest.Mock<
    Promise<Auth0TokenResponse>,
    [{ detailedResponse: true; cacheMode?: 'on' | 'off' }]
  >;

  function createAuth0Provider(): Auth0AuthProvider {
    return {
      isLoading,
      isAuthenticated,
      error,
      getAccessTokenSilently,
    };
  }

  function configureTestingModule(auth0Provider: Auth0AuthProvider = createAuth0Provider()) {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: AUTH0_AUTH, useValue: auth0Provider },
        provideAuth0Auth(),
      ],
    });
  }

  beforeEach(() => {
    isLoading = signal(false);
    isAuthenticated = signal(false);
    error = signal<Error | undefined>(undefined);
    getAccessTokenSilently = jest.fn().mockResolvedValue({ id_token: 'token' });
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

  it('bridges Auth0 state into CONVEX_AUTH', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.isLoading()).toBe(false);
    expect(provider.isAuthenticated()).toBe(false);

    isLoading.set(true);
    isAuthenticated.set(true);

    expect(provider.isLoading()).toBe(true);
    expect(provider.isAuthenticated()).toBe(true);
  });

  it('passes through the upstream error signal', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.error).toBe(error);

    const upstreamError = new Error('auth0 failed');
    error.set(upstreamError);

    expect(provider.error?.()).toBe(upstreamError);
  });

  it('requests cached Auth0 tokens by default', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const token = await provider.fetchAccessToken({ forceRefreshToken: false });

    expect(token).toBe('token');
    expect(getAccessTokenSilently).toHaveBeenCalledWith({
      detailedResponse: true,
      cacheMode: 'on',
    });
  });

  it('requests fresh Auth0 tokens when forceRefreshToken is true', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const token = await provider.fetchAccessToken({ forceRefreshToken: true });

    expect(token).toBe('token');
    expect(getAccessTokenSilently).toHaveBeenCalledWith({
      detailedResponse: true,
      cacheMode: 'off',
    });
  });

  it('rethrows when Auth0 token fetching fails', async () => {
    getAccessTokenSilently.mockRejectedValue(new Error('boom'));
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: true })).rejects.toThrow('boom');
  });

  it('throws a focused error when Auth0 returns a string token instead of a detailed response', async () => {
    configureTestingModule({
      isLoading,
      isAuthenticated,
      error,
      getAccessTokenSilently: jest.fn().mockResolvedValue('token' as unknown as Auth0TokenResponse),
    });

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: true })).rejects.toThrow(
      'Auth0 provider must return the detailed response from `getAccessTokenSilently(...)` with an `id_token`.',
    );
  });

  it('throws a focused error when Auth0 omits id_token from the detailed response', async () => {
    configureTestingModule({
      isLoading,
      isAuthenticated,
      error,
      getAccessTokenSilently: jest
        .fn()
        .mockResolvedValue({ access_token: 'access-only' } as unknown as Auth0TokenResponse),
    });

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: true })).rejects.toThrow(
      'Auth0 provider must return the detailed response from `getAccessTokenSilently(...)` with an `id_token`.',
    );
  });

  it('surfaces Auth0 token fetch failures through injectAuth().error()', fakeAsync(() => {
    isAuthenticated.set(true);
    getAccessTokenSilently.mockRejectedValue(new Error('boom'));
    configureTestingModule();

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
        message: '[convex-angular auth] Token fetch failed: boom',
      }),
    );
  }));

  it('surfaces invalid Auth0 detailed responses through injectAuth().error() and resolves null to Convex', fakeAsync(() => {
    isAuthenticated.set(true);
    getAccessTokenSilently.mockResolvedValue({ access_token: 'access-only' } as unknown as Auth0TokenResponse);
    configureTestingModule();

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
        message:
          '[convex-angular auth] Token fetch failed: Auth0 provider must return the detailed response from `getAccessTokenSilently(...)` with an `id_token`. String-only token providers are no longer supported.',
      }),
    );
  }));

  it('bundles provideConvexAuth so injectAuth works without separate setup', fakeAsync(() => {
    isAuthenticated.set(true);
    configureTestingModule();

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

    expect(mockSetAuth).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.auth.status()).toBe('loading');

    setAuthOnChange?.(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    expect(setAuthFetcher).toBeDefined();
  }));

  it('throws when combined with provideConvexAuth in the same injector', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: AUTH0_AUTH, useValue: createAuth0Provider() },
        provideAuth0Auth(),
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
    configureTestingModule();

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() =>
      createEnvironmentInjector(
        [{ provide: AUTH0_AUTH, useValue: createAuth0Provider() }, provideAuth0Auth()],
        rootInjector,
      ),
    ).toThrow(/must be configured only in your root application providers/);
  });
});
