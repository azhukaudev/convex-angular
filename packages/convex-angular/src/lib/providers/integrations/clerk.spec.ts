import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX_AUTH } from '../../tokens/auth';
import { CONVEX } from '../../tokens/convex';
import { injectAuth, provideConvexAuth } from '../inject-auth';
import { CLERK_AUTH, ClerkAuthProvider, provideClerkAuth } from './clerk';

describe('provideClerkAuth', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let mockClearAuth: jest.Mock;
  let mockHasAuth: jest.Mock;
  let setAuthFetcher: ((args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>) | undefined;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

  let isLoaded: ReturnType<typeof signal<boolean>>;
  let isSignedIn: ReturnType<typeof signal<boolean | undefined>>;
  let orgId: ReturnType<typeof signal<string | null | undefined>>;
  let orgRole: ReturnType<typeof signal<string | null | undefined>>;
  let sessionClaims: ReturnType<typeof signal<Record<string, unknown> | null | undefined>>;
  let error: ReturnType<typeof signal<Error | undefined>>;
  let getToken: jest.Mock<Promise<string | null>, [{ template?: string; skipCache?: boolean }?]>;

  function createClerkProvider(): ClerkAuthProvider {
    return {
      isLoaded,
      isSignedIn,
      orgId,
      orgRole,
      sessionClaims,
      error,
      getToken,
    };
  }

  function configureTestingModule(clerkProvider: ClerkAuthProvider = createClerkProvider()) {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CLERK_AUTH, useValue: clerkProvider },
        provideClerkAuth(),
      ],
    });
  }

  beforeEach(() => {
    isLoaded = signal(true);
    isSignedIn = signal<boolean | undefined>(false);
    orgId = signal<string | null | undefined>(null);
    orgRole = signal<string | null | undefined>(null);
    sessionClaims = signal<Record<string, unknown> | null | undefined>({
      aud: 'convex',
    });
    error = signal<Error | undefined>(undefined);
    getToken = jest.fn().mockResolvedValue('token');
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

  it('bridges Clerk state into CONVEX_AUTH', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.isLoading()).toBe(false);
    expect(provider.isAuthenticated()).toBe(false);

    isLoaded.set(false);
    isSignedIn.set(undefined);

    expect(provider.isLoading()).toBe(true);
    expect(provider.isAuthenticated()).toBe(false);

    isLoaded.set(true);
    isSignedIn.set(true);

    expect(provider.isLoading()).toBe(false);
    expect(provider.isAuthenticated()).toBe(true);
  });

  it('exposes reauthVersion from org signals', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.reauthVersion?.()).toEqual([null, null]);

    orgId.set('org_123');
    orgRole.set('admin');

    expect(provider.reauthVersion?.()).toEqual(['org_123', 'admin']);
  });

  it('does not include session claims in reauthVersion', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    sessionClaims.set({ aud: 'convex', sub: 'user_123' });

    expect(provider.reauthVersion?.()).toEqual([null, null]);
  });

  it('falls back to undefined reauth values when org signals are missing', () => {
    configureTestingModule({
      isLoaded,
      isSignedIn,
      sessionClaims,
      error,
      getToken,
    });

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.reauthVersion?.()).toEqual([undefined, undefined]);
  });

  it('passes through the upstream error signal', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.error).toBe(error);

    const upstreamError = new Error('clerk failed');
    error.set(upstreamError);

    expect(provider.error?.()).toBe(upstreamError);
  });

  it('requests cached Clerk tokens by default', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const token = await provider.fetchAccessToken({ forceRefreshToken: false });

    expect(token).toBe('token');
    expect(getToken).toHaveBeenCalledWith({ skipCache: false });
  });

  it('requests fresh Clerk tokens when forceRefreshToken is true', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const token = await provider.fetchAccessToken({ forceRefreshToken: true });

    expect(token).toBe('token');
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it('fetches Clerk tokens even when session claims are missing', async () => {
    sessionClaims.set(undefined);
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: false })).resolves.toBe('token');
    expect(getToken).toHaveBeenCalledWith({ skipCache: false });
  });

  it('fetches Clerk tokens even when session claims do not target convex', async () => {
    sessionClaims.set({ aud: 'other-audience' });
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: false })).resolves.toBe('token');
    expect(getToken).toHaveBeenCalledWith({ skipCache: false });
  });

  it('rethrows when Clerk token fetching fails', async () => {
    getToken.mockRejectedValue(new Error('boom'));
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: true })).rejects.toThrow('boom');
  });

  it('surfaces Clerk token fetch failures through injectAuth().error()', fakeAsync(() => {
    isSignedIn.set(true);
    getToken.mockRejectedValue(new Error('boom'));
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

  it('bundles provideConvexAuth so injectAuth works without separate setup', fakeAsync(() => {
    isSignedIn.set(true);
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

  it('does not reauthenticate when only sessionClaims changes', fakeAsync(() => {
    isSignedIn.set(true);
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

    sessionClaims.set({ aud: 'convex', sub: 'user_123' });
    fixture.detectChanges();
    tick();

    expect(mockSetAuth).toHaveBeenCalledTimes(1);
  }));

  it('throws when combined with provideConvexAuth in the same injector', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CLERK_AUTH, useValue: createClerkProvider() },
        provideClerkAuth(),
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
        [{ provide: CLERK_AUTH, useValue: createClerkProvider() }, provideClerkAuth()],
        rootInjector,
      ),
    ).toThrow(/must be configured only in your root application providers/);
  });
});
