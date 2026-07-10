import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { BetterAuthClientLike, BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';
import { BETTER_AUTH_CLIENT_FACTORY, BetterAuthService } from './better-auth.service';

const session = (id: string): BetterAuthSessionData => ({ session: { id }, user: { id: 'user-1' } });
const ok = <T>(data: T): BetterAuthFetchResult<T> => ({ data, error: null });
const fail = <T>(status: number, message = 'denied'): BetterAuthFetchResult<T> => ({
  data: null,
  error: { status, message },
});

class FakeBetterAuthClient implements BetterAuthClientLike {
  sessionResult: BetterAuthFetchResult<BetterAuthSessionData> = ok(session('s1'));
  tokenResult: BetterAuthFetchResult<{ token?: string | null }> = ok({ token: 'jwt-1' });
  tokenCalls = 0;
  sessionCalls = 0;
  updateSessionCalls = 0;
  sessionDataFallback: BetterAuthSessionData | null = null;

  async getSession() {
    this.sessionCalls += 1;
    return this.sessionResult;
  }

  convex = {
    token: async () => {
      this.tokenCalls += 1;
      return this.tokenResult;
    },
  };

  getSessionData = () => this.sessionDataFallback;
  updateSession = () => {
    this.updateSessionCalls += 1;
  };
}

describe('BetterAuthService', () => {
  let client: FakeBetterAuthClient;
  let factoryCalls: number;

  function setup(platform: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({
      providers: [
        BetterAuthService,
        { provide: PLATFORM_ID, useValue: platform },
        {
          provide: BETTER_AUTH_CLIENT_FACTORY,
          useValue: () => {
            factoryCalls += 1;
            return client;
          },
        },
      ],
    });
    return TestBed.inject(BetterAuthService);
  }

  beforeEach(() => {
    client = new FakeBetterAuthClient();
    factoryCalls = 0;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the initial session and reports authenticated', fakeAsync(() => {
    const service = setup();
    expect(service.isLoading()).toBe(true);

    tick();

    expect(service.isLoading()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.session()).toEqual(session('s1'));
    expect(service.error()).toBeUndefined();
  }));

  it('treats 401/403 session responses as signed out, not errors', fakeAsync(() => {
    client.sessionResult = fail(401);
    const service = setup();
    tick();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.session()).toBeNull();
    expect(service.error()).toBeUndefined();
  }));

  it('surfaces non-auth session failures through error()', fakeAsync(() => {
    client.sessionResult = fail(500, 'boom');
    const service = setup();
    tick();

    expect(service.error()?.message).toContain('boom');
  }));

  it('falls back to getSessionData() when getSession returns no data', fakeAsync(() => {
    client.sessionResult = ok(null as never);
    client.sessionDataFallback = session('cross-domain');
    const service = setup();
    tick();

    expect(service.session()).toEqual(session('cross-domain'));
    expect(service.isAuthenticated()).toBe(true);
  }));

  it('exchanges, caches, and dedups Convex tokens', fakeAsync(() => {
    const service = setup();
    tick();

    let first: string | null = null;
    let second: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (first = t));
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (second = t));
    tick();

    expect(first).toBe('jwt-1');
    expect(second).toBe('jwt-1');
    expect(client.tokenCalls).toBe(1); // deduped while inflight, then cached

    let third: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (third = t));
    tick();
    expect(third).toBe('jwt-1');
    expect(client.tokenCalls).toBe(1); // served from cache
  }));

  it('bypasses the cache when forceRefreshToken is set', fakeAsync(() => {
    const service = setup();
    tick();

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();
    client.tokenResult = ok({ token: 'jwt-2' });

    let refreshed: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: true }).then((t) => (refreshed = t));
    tick();

    expect(refreshed).toBe('jwt-2');
    expect(client.tokenCalls).toBe(2);
  }));

  it('returns null without calling the client when signed out', fakeAsync(() => {
    client.sessionResult = fail(401);
    const service = setup();
    tick();

    let token: string | null = 'sentinel' as never;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (token = t));
    tick();

    expect(token).toBeNull();
    expect(client.tokenCalls).toBe(0);
  }));

  it('treats 401/403 token responses as signed out, surfaces other failures', fakeAsync(() => {
    const service = setup();
    tick();

    client.tokenResult = fail(401);
    void service.fetchAccessToken({ forceRefreshToken: true });
    tick();
    expect(service.error()).toBeUndefined();

    client.tokenResult = fail(500, 'exchange exploded');
    void service.fetchAccessToken({ forceRefreshToken: true });
    tick();
    expect(service.error()?.message).toContain('exchange exploded');
  }));

  it('bumps reauthVersion and invalidates the token cache when the session id changes', fakeAsync(() => {
    const service = setup();
    tick();
    const initialVersion = service.reauthVersion();

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();
    expect(client.tokenCalls).toBe(1);

    client.sessionResult = ok(session('s2'));
    void service.refreshSession();
    tick();

    expect(service.reauthVersion()).toBe(initialVersion + 1);

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();
    expect(client.tokenCalls).toBe(2); // cache was invalidated
  }));

  it('clearSession() signs out locally and notifies the client', fakeAsync(() => {
    const service = setup();
    tick();

    service.clearSession();

    expect(service.session()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(client.updateSessionCalls).toBe(1);
  }));

  it('is inert on the server platform', fakeAsync(() => {
    const service = setup('server');
    tick();

    expect(factoryCalls).toBe(0);
    expect(service.isLoading()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);

    void service.refreshSession();
    service.clearSession();
    tick();
    expect(factoryCalls).toBe(0);
  }));
});
