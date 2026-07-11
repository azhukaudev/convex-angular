import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import type { Mock, Mocked } from 'vitest';

import { CONVEX_AUTH } from '../../tokens/auth';
import { CONVEX } from '../../tokens/convex';
import { injectAuth, provideConvexAuth } from '../inject-auth';
import { CLERK_AUTH, ClerkAuthProvider, provideClerkAuth } from './clerk';

describe('provideClerkAuth', () => {
  let mockConvexClient: Mocked<ConvexClient>;
  let mockSetAuth: Mock;
  let mockClearAuth: Mock;
  let mockHasAuth: Mock;
  let setAuthFetcher: ((args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>) | undefined;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

  let isLoaded: ReturnType<typeof signal<boolean>>;
  let isSignedIn: ReturnType<typeof signal<boolean | undefined>>;
  let sessionId: ReturnType<typeof signal<string | null | undefined>>;
  let orgId: ReturnType<typeof signal<string | null | undefined>>;
  let orgRole: ReturnType<typeof signal<string | null | undefined>>;
  let sessionAudience: ReturnType<typeof signal<string | null | undefined>>;
  let error: ReturnType<typeof signal<Error | undefined>>;
  let getToken: Mock<(opts?: { template?: string; skipCache?: boolean }) => Promise<string | null>>;

  function createClerkProvider(): ClerkAuthProvider {
    return {
      isLoaded,
      isSignedIn,
      sessionId,
      orgId,
      orgRole,
      sessionAudience,
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
    sessionId = signal<string | null | undefined>(null);
    orgId = signal<string | null | undefined>(null);
    orgRole = signal<string | null | undefined>(null);
    sessionAudience = signal<string | null | undefined>(undefined);
    error = signal<Error | undefined>(undefined);
    getToken = vi.fn().mockResolvedValue('token');
    setAuthFetcher = undefined;
    setAuthOnChange = undefined;

    mockSetAuth = vi.fn((fetchToken, onChange) => {
      setAuthFetcher = fetchToken;
      setAuthOnChange = onChange;
    });
    mockClearAuth = vi.fn();
    mockHasAuth = vi.fn().mockReturnValue(false);

    mockConvexClient = {
      disabled: false,
      client: {
        setAuth: mockSetAuth,
        clearAuth: mockClearAuth,
        hasAuth: mockHasAuth,
      },
    } as unknown as Mocked<ConvexClient>;
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

  it('exposes reauthVersion from session and org signals', () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.reauthVersion?.()).toEqual([null, null, null]);

    orgId.set('org_123');
    orgRole.set('admin');

    expect(provider.reauthVersion?.()).toEqual([null, 'org_123', 'admin']);
  });

  it('changes reauthVersion when the Clerk session is replaced', () => {
    sessionId.set('sess_1');
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const initialVersion = provider.reauthVersion?.();

    // Sign out and back in: Clerk replaces the session while org context
    // stays the same. Convex must re-run auth setup or it keeps fetching
    // tokens for the dead session.
    sessionId.set('sess_2');

    expect(provider.reauthVersion?.()).not.toEqual(initialVersion);
  });

  it('falls back to undefined reauth values when session and org signals are missing', () => {
    configureTestingModule({
      isLoaded,
      isSignedIn,
      error,
      getToken,
    });

    const provider = TestBed.inject(CONVEX_AUTH);

    expect(provider.reauthVersion?.()).toEqual([undefined, undefined, undefined]);
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
    expect(getToken).toHaveBeenCalledWith({
      template: 'convex',
      skipCache: false,
    });
  });

  it('requests fresh Clerk tokens when forceRefreshToken is true', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    const token = await provider.fetchAccessToken({ forceRefreshToken: true });

    expect(token).toBe('token');
    expect(getToken).toHaveBeenCalledWith({
      template: 'convex',
      skipCache: true,
    });
  });

  it('requests the JWT template when sessionAudience is absent', async () => {
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    await provider.fetchAccessToken({ forceRefreshToken: false });

    expect(getToken).toHaveBeenCalledWith({
      template: 'convex',
      skipCache: false,
    });
  });

  it('uses Clerk native Convex integration (no template) when sessionAudience is convex', async () => {
    sessionAudience.set('convex');
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);
    await provider.fetchAccessToken({ forceRefreshToken: true });

    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(getToken).not.toHaveBeenCalledWith(expect.objectContaining({ template: expect.anything() }));
  });

  it('resolves null instead of rejecting when Clerk token fetching fails', async () => {
    // Mirrors convex-react's Clerk adapter: a failed token fetch is the
    // signed-out outcome, not an auth error.
    getToken.mockRejectedValue(new Error('Clerk token fetch failed'));
    configureTestingModule();

    const provider = TestBed.inject(CONVEX_AUTH);

    await expect(provider.fetchAccessToken({ forceRefreshToken: true })).resolves.toBeNull();
  });

  it('treats a failed Clerk token fetch as a clean signed-out state, not an error', fakeAsync(() => {
    isSignedIn.set(true);
    getToken.mockRejectedValue(new Error('Clerk token fetch failed'));
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
    expect(fixture.componentInstance.auth.error()).toBeUndefined();
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
