import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';
import { FakeBetterAuthClient, createDeferred, fail, ok, session } from './better-auth-client.fake';
import { BETTER_AUTH_CLIENT_FACTORY, BetterAuthService } from './better-auth.service';

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

  it('exposes its state signals read-only', () => {
    const service = setup('server');
    for (const state of [service.session, service.isLoading, service.isAuthenticated, service.reauthVersion]) {
      expect('set' in state).toBe(false);
    }
    expect('set' in service.convexAuth.isAuthenticated).toBe(false);
  });

  it('treats 401/403 session responses as signed out, not errors', fakeAsync(() => {
    client.sessionResult = fail(401);
    const service = setup();
    tick();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.session()).toBeNull();
    expect(service.error()).toBeUndefined();
  }));

  it('treats a 403 session response as signed out, not an error', fakeAsync(() => {
    client.sessionResult = fail(403);
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

    // Anchored on the prefix only: consumers rely on it to tell a library error
    // from their own. The prose after it is not contract.
    expect(service.error()?.message).toMatch(/^\[convex-angular better-auth]/);
    expect(service.error()?.message).toMatch(/Session refresh failed/);
    expect(service.error()?.message).toMatch(/boom/);
  }));

  it('clears a standing session error once a later refresh succeeds', fakeAsync(() => {
    client.sessionResult = fail(500, 'boom');
    const service = setup();
    tick();
    expect(service.error()).toBeDefined();

    client.sessionResult = ok(session('s1'));
    void service.refreshSession();
    tick();

    expect(service.error()).toBeUndefined();
    expect(service.isAuthenticated()).toBe(true);
  }));

  it('falls back to getSessionData() when getSession returns no data', fakeAsync(() => {
    client.sessionResult = ok(null as never);
    client.sessionDataFallback = session('cross-domain');
    const service = setup();
    tick();

    expect(service.session()).toEqual(session('cross-domain'));
    expect(service.isAuthenticated()).toBe(true);
  }));

  it.each([
    ['a session without an id', { session: {}, user: { id: 'u1' } }],
    ['a session whose id is not a string', { session: { id: 1 }, user: { id: 'u1' } }],
    ['a snapshot without a user', { session: { id: 's1' } }],
    ['a user without an id', { session: { id: 's1' }, user: {} }],
    ['a user whose id is not a string', { session: { id: 's1' }, user: { id: 1 } }],
    ['a null session', { session: null, user: { id: 'u1' } }],
    ['a null user', { session: { id: 's1' }, user: null }],
    ['a non-object value', 'garbage'],
    ['a function carrying a valid-looking snapshot', Object.assign(() => undefined, session('s1'))],
  ])(
    'ignores a getSessionData() fallback that is not a session snapshot: %s',
    fakeAsync((_label: string, malformed: unknown) => {
      client.sessionResult = ok(null as never);
      client.sessionDataFallback = malformed;
      const service = setup();
      tick();

      expect(service.session()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.error()).toBeUndefined();
    }),
  );

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

    client.tokenResult = fail(403);
    void service.fetchAccessToken({ forceRefreshToken: true });
    tick();
    expect(service.error()).toBeUndefined();

    client.tokenResult = fail(500, 'exchange exploded');
    void service.fetchAccessToken({ forceRefreshToken: true });
    tick();
    expect(service.error()?.message).toMatch(/Convex token exchange failed/);
    expect(service.error()?.message).toMatch(/exchange exploded/);
  }));

  it('drops the cached token when the current exchange fails', fakeAsync(() => {
    const service = setup();
    tick();

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();
    expect(client.tokenCalls).toBe(1);

    client.tokenResult = fail(500, 'exchange exploded');
    void service.fetchAccessToken({ forceRefreshToken: true });
    tick();

    client.tokenResult = ok({ token: 'jwt-2' });
    let retried: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (retried = t));
    tick();

    expect(retried).toBe('jwt-2'); // the failed exchange invalidated the cache
    expect(client.tokenCalls).toBe(3);
  }));

  it('re-requests a token after a rejected exchange instead of replaying it', fakeAsync(() => {
    const service = setup();
    tick();

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();

    client.tokenRejection = new Error('socket closed');
    let failed: string | null = 'sentinel';
    void service.fetchAccessToken({ forceRefreshToken: true }).then((t) => (failed = t));
    tick();

    expect(failed).toBeNull();
    expect(service.error()?.message).toMatch(/Convex token exchange failed/);
    expect(service.error()?.message).toMatch(/socket closed/);

    client.tokenRejection = undefined;
    client.tokenResult = ok({ token: 'jwt-2' });
    let retried: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (retried = t));
    tick();

    expect(retried).toBe('jwt-2'); // a fresh request, not the settled failed one
    expect(client.tokenCalls).toBe(3);
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

  it('leaves reauthVersion and the token cache alone when the session id is unchanged', fakeAsync(() => {
    const service = setup();
    tick();
    const initialVersion = service.reauthVersion();

    void service.fetchAccessToken({ forceRefreshToken: false });
    tick();
    expect(client.tokenCalls).toBe(1);

    void service.refreshSession(); // same session id
    tick();

    expect(service.reauthVersion()).toBe(initialVersion);

    let cached: string | null = null;
    void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
    tick();
    expect(cached).toBe('jwt-1');
    expect(client.tokenCalls).toBe(1); // still served from the untouched cache
  }));

  describe('retrying a failed token exchange on a same-session refresh', () => {
    // Loads the session, fails the Convex token exchange (a 500 response unless told otherwise) and lets one
    // token request run against it.
    function afterFailedExchange(
      failExchange: () => void = () => {
        client.tokenResult = fail(500, 'exchange exploded');
      },
    ) {
      const service = setup();
      tick();
      const initialVersion = service.reauthVersion();

      failExchange();
      void service.fetchAccessToken({ forceRefreshToken: false });
      tick();
      return { service, initialVersion };
    }

    // The failure alone never re-registers Convex auth, the first same-session refresh does, and the second finds
    // nothing left to retry.
    it.each([
      [
        'an error response',
        () => {
          client.tokenResult = fail(500, 'exchange exploded');
        },
      ],
      [
        'an expected 401 response',
        () => {
          client.tokenResult = fail(401);
        },
      ],
      [
        'a rejected exchange',
        () => {
          client.tokenRejection = new Error('socket closed');
        },
      ],
      [
        'a response that carries no token',
        () => {
          client.tokenResult = ok({ token: null });
        },
      ],
    ])(
      'after %s',
      fakeAsync((_label: string, failExchange: () => void) => {
        const { service, initialVersion } = afterFailedExchange(failExchange);
        expect(service.reauthVersion()).toBe(initialVersion);

        void service.refreshSession();
        tick();
        expect(service.reauthVersion()).toBe(initialVersion + 1);

        void service.refreshSession();
        tick();
        expect(service.reauthVersion()).toBe(initialVersion + 1);
      }),
    );

    it('stays quiet once the retried exchange succeeded', fakeAsync(() => {
      const { service, initialVersion } = afterFailedExchange();
      void service.refreshSession();
      tick();
      expect(service.reauthVersion()).toBe(initialVersion + 1);

      client.tokenResult = ok({ token: 'jwt-2' });
      void service.fetchAccessToken({ forceRefreshToken: false });
      tick();
      void service.refreshSession();
      tick();

      expect(service.reauthVersion()).toBe(initialVersion + 1);
    }));

    it('does not bump while a token exchange is already in flight', fakeAsync(() => {
      const { service, initialVersion } = afterFailedExchange();

      const retry = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue.push(retry.promise);
      void service.fetchAccessToken({ forceRefreshToken: false });
      void service.refreshSession();
      tick();
      expect(service.reauthVersion()).toBe(initialVersion);

      retry.resolve(ok({ token: 'jwt-2' }));
      tick();
      void service.refreshSession();
      tick();
      expect(service.reauthVersion()).toBe(initialVersion);
    }));

    it('bumps exactly once when the refresh also changes the session id', fakeAsync(() => {
      const { service, initialVersion } = afterFailedExchange();

      client.sessionResult = ok(session('s2'));
      void service.refreshSession();
      tick();

      expect(service.reauthVersion()).toBe(initialVersion + 1);
    }));

    it('bumps exactly once when the refresh ends signed out', fakeAsync(() => {
      const { service, initialVersion } = afterFailedExchange();

      client.sessionResult = fail(401);
      void service.refreshSession();
      tick();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.reauthVersion()).toBe(initialVersion + 1);
    }));

    it('only bumps for the sign-out itself when clearSession() follows a failed exchange', fakeAsync(() => {
      const { service, initialVersion } = afterFailedExchange();

      service.clearSession();

      expect(service.reauthVersion()).toBe(initialVersion + 1);
    }));

    // A signed-out first load is not a failed exchange: no token was ever requested, so a later
    // refresh has nothing to retry.
    it('does not bump on a signed-out load', fakeAsync(() => {
      client.sessionResult = fail(401);
      const service = setup();
      tick();

      expect(service.reauthVersion()).toBe(0);
    }));
  });

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

  describe('client boundary', () => {
    it('names the missing client factory token when provideBetterAuth() was not registered', () => {
      TestBed.configureTestingModule({
        providers: [BetterAuthService, { provide: PLATFORM_ID, useValue: 'browser' }],
      });

      expect(() => TestBed.inject(BetterAuthService)).toThrow(/BETTER_AUTH_CLIENT_FACTORY/);
    });

    it('asks for the session and the Convex token without throwing on failure', fakeAsync(() => {
      const service = setup();
      tick();

      void service.fetchAccessToken({ forceRefreshToken: false });
      tick();

      // `throw: false` is what makes a 401 arrive as an `{ error }` envelope —
      // a clean signed-out outcome — rather than a rejection.
      expect(client.lastSessionOptions).toEqual({ fetchOptions: { throw: false } });
      expect(client.lastTokenOptions).toEqual({ fetchOptions: { throw: false } });
    }));
  });

  describe('error normalisation', () => {
    const SESSION_FAILED = '[convex-angular better-auth] Session refresh failed: ';

    it.each<[string, NonNullable<BetterAuthFetchResult<BetterAuthSessionData>['error']>, string]>([
      ['its message', { status: 500, message: 'boom' }, 'boom'],
      ['its status text when it has no message', { status: 502, statusText: 'Bad Gateway' }, 'Bad Gateway'],
      ['its status code when the status text is empty', { status: 502, statusText: '' }, 'HTTP 502'],
      ['its status code when there is no status text', { status: 500 }, 'HTTP 500'],
      ['its string form when it carries nothing', {}, '[object Object]'],
    ])(
      'describes an error envelope by %s',
      fakeAsync(
        (_label: string, error: NonNullable<BetterAuthFetchResult<BetterAuthSessionData>['error']>, cause: string) => {
          client.sessionResult = { data: null, error };
          const service = setup();
          tick();

          expect(service.error()?.message).toBe(`${SESSION_FAILED}${cause}`);
        },
      ),
    );

    it.each<[string, unknown, string]>([
      ['an Error by its message', new Error('network down'), 'network down'],
      ['a string as is', 'network offline', 'network offline'],
      ['null', null, 'null'],
      ['undefined', undefined, 'undefined'],
    ])(
      'describes a rejection with %s',
      fakeAsync((_label: string, rejection: unknown, cause: string) => {
        client.sessionQueue.push(Promise.reject(rejection));
        const service = setup();
        tick();

        expect(service.error()?.message).toBe(`${SESSION_FAILED}${cause}`);
      }),
    );

    it('clears the session and surfaces the failure when the session request throws', fakeAsync(() => {
      const service = setup();
      tick();
      expect(service.isAuthenticated()).toBe(true);

      client.sessionRejection = new Error('network down');
      void service.refreshSession();
      tick();

      expect(service.error()?.message).toMatch(/Session refresh failed/);
      expect(service.error()?.message).toMatch(/network down/);
      expect(service.session()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    }));

    it('surfaces a non-Error rejection', fakeAsync(() => {
      const service = setup();
      tick();

      client.tokenRejection = 'network offline';
      void service.fetchAccessToken({ forceRefreshToken: true });
      tick();

      expect(service.error()?.message).toMatch(/Convex token exchange failed/);
      expect(service.error()?.message).toMatch(/network offline/);
    }));
  });

  describe('401/403 session fallback', () => {
    it('ignores a stale getSessionData() fallback on an expected 401/403 response', fakeAsync(() => {
      client.sessionResult = fail(401);
      client.sessionDataFallback = session('stale-cached');
      const service = setup();
      tick();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.session()).toBeNull();
      expect(service.error()).toBeUndefined();
    }));
  });
});
