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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FetchOptions {
  fetchOptions?: { throw?: boolean };
}

class FakeBetterAuthClient implements BetterAuthClientLike {
  sessionResult: BetterAuthFetchResult<BetterAuthSessionData> = ok(session('s1'));
  tokenResult: BetterAuthFetchResult<{ token?: string | null }> = ok({ token: 'jwt-1' });
  tokenCalls = 0;
  sessionCalls = 0;
  updateSessionCalls = 0;
  sessionDataFallback: BetterAuthSessionData | null = null;
  lastSessionOptions: FetchOptions | undefined;
  lastTokenOptions: FetchOptions | undefined;

  // A value the next call should reject with, as opposed to resolving with an
  // `{ error }` envelope. `undefined` means "resolve normally".
  sessionRejection: unknown;
  tokenRejection: unknown;

  // Queued per-call overrides so race tests can control resolution order;
  // consumed in call order, falling back to sessionResult/tokenResult.
  sessionQueue: Array<Promise<BetterAuthFetchResult<BetterAuthSessionData>>> = [];
  tokenQueue: Array<Promise<BetterAuthFetchResult<{ token?: string | null }>>> = [];

  async getSession(options?: FetchOptions) {
    this.sessionCalls += 1;
    this.lastSessionOptions = options;
    if (this.sessionRejection !== undefined) {
      throw this.sessionRejection;
    }
    return this.envelope(await (this.sessionQueue.shift() ?? this.sessionResult), options);
  }

  convex = {
    token: async (options?: FetchOptions) => {
      this.tokenCalls += 1;
      this.lastTokenOptions = options;
      if (this.tokenRejection !== undefined) {
        throw this.tokenRejection;
      }
      return this.envelope(await (this.tokenQueue.shift() ?? this.tokenResult), options);
    },
  };

  getSessionData = () => this.sessionDataFallback;
  updateSession = () => {
    this.updateSessionCalls += 1;
  };

  // Better Auth semantics: with `fetchOptions.throw` the client rejects with
  // the error instead of handing back the `{ data, error }` envelope.
  private envelope<T>(result: BetterAuthFetchResult<T>, options?: FetchOptions): BetterAuthFetchResult<T> {
    if (options?.fetchOptions?.throw && result.error) {
      throw result.error;
    }
    return result;
  }
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
    let failed: string | null = 'sentinel' as never;
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

  describe('session refresh / sign-out race', () => {
    it('discards a stale refreshSession() result after a concurrent clearSession()', fakeAsync(() => {
      const service = setup();
      tick(); // settle the constructor's initial refresh (session s1)

      const deferred = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      client.sessionQueue = [deferred.promise];

      void service.refreshSession(); // in flight, awaiting the deferred response
      service.clearSession(); // signs out synchronously and bumps the epoch

      expect(service.isAuthenticated()).toBe(false);
      expect(service.session()).toBeNull();

      deferred.resolve(ok(session('s1'))); // the stale refresh response lands late
      tick();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.session()).toBeNull();
      expect(service.isLoading()).toBe(false);
    }));

    it('only applies the result of the most recently started overlapping refreshSession()', fakeAsync(() => {
      const service = setup();
      tick();

      const first = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      const second = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      client.sessionQueue = [first.promise, second.promise];

      void service.refreshSession(); // consumes first.promise
      void service.refreshSession(); // consumes second.promise

      second.resolve(ok(session('s-second')));
      tick();
      expect(service.session()).toEqual(session('s-second'));

      first.resolve(ok(session('s-first'))); // the earlier call resolves later
      tick();

      expect(service.session()).toEqual(session('s-second'));
      expect(service.isLoading()).toBe(false);
    }));

    it('discards every refresh already in flight when clearSession() supersedes them', fakeAsync(() => {
      const service = setup();
      tick();

      const first = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      const second = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      client.sessionQueue = [first.promise, second.promise];

      void service.refreshSession();
      void service.refreshSession();
      service.clearSession();

      first.resolve(ok(session('s-first')));
      tick();
      expect(service.session()).toBeNull();

      second.resolve(ok(session('s-second')));
      tick();

      expect(service.session()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    }));

    it('stays loading while a newer refresh is still in flight', fakeAsync(() => {
      const service = setup();
      tick();

      const first = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      const second = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      client.sessionQueue = [first.promise, second.promise];

      void service.refreshSession();
      void service.refreshSession();

      first.resolve(ok(session('s-first')));
      tick();

      expect(service.isLoading()).toBe(true); // superseded result must not settle the state
      expect(service.session()).toEqual(session('s1'));

      second.resolve(ok(session('s-second')));
      tick();

      expect(service.isLoading()).toBe(false);
      expect(service.session()).toEqual(session('s-second'));
    }));

    it('ignores a rejection from a refresh that a sign-out superseded', fakeAsync(() => {
      const service = setup();
      tick();

      const pending = createDeferred<BetterAuthFetchResult<BetterAuthSessionData>>();
      client.sessionQueue = [pending.promise];

      void service.refreshSession();
      service.clearSession();

      pending.reject(new Error('late network failure'));
      tick();

      expect(service.error()).toBeUndefined();
      expect(service.session()).toBeNull();
      expect(service.isLoading()).toBe(false);
    }));
  });

  describe('token cache race', () => {
    it('does not let a stale non-forced token response overwrite a forced refresh result', fakeAsync(() => {
      const service = setup();
      tick();

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise];

      void service.fetchAccessToken({ forceRefreshToken: false }); // pending, awaiting `stale`

      client.tokenResult = ok({ token: 'jwt-B' });
      let forced: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: true }).then((t) => (forced = t));
      tick();

      expect(forced).toBe('jwt-B');
      expect(client.tokenCalls).toBe(2);

      stale.resolve(ok({ token: 'jwt-A' })); // the superseded request resolves late
      tick();

      let cached: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
      tick();

      expect(cached).toBe('jwt-B'); // cache still holds the fresher forced token
      expect(client.tokenCalls).toBe(2); // served from cache, no extra client call
    }));

    it('keeps the fresher cached token when a superseded exchange fails', fakeAsync(() => {
      const service = setup();
      tick();

      void service.fetchAccessToken({ forceRefreshToken: false });
      tick(); // caches jwt-1

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: true });
      void service.fetchAccessToken({ forceRefreshToken: true });

      fresh.resolve(ok({ token: 'jwt-fresh' }));
      tick();

      stale.resolve(fail(500, 'late failure')); // the superseded request fails afterwards
      tick();

      let cached: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
      tick();

      expect(cached).toBe('jwt-fresh');
      expect(client.tokenCalls).toBe(3); // cache untouched by the superseded failure
    }));

    it('keeps the fresher cached token when a superseded exchange rejects', fakeAsync(() => {
      const service = setup();
      tick();

      void service.fetchAccessToken({ forceRefreshToken: false });
      tick(); // caches jwt-1

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: true });
      void service.fetchAccessToken({ forceRefreshToken: true });

      fresh.resolve(ok({ token: 'jwt-fresh' }));
      tick();

      stale.reject(new Error('late failure'));
      tick();

      let cached: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
      tick();

      expect(cached).toBe('jwt-fresh');
      expect(client.tokenCalls).toBe(3);
    }));

    it('keeps a newer in-flight request available for dedup when a superseded one settles', fakeAsync(() => {
      const service = setup();
      tick();

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: false });
      void service.fetchAccessToken({ forceRefreshToken: true });

      stale.resolve(ok({ token: 'jwt-stale' }));
      tick();

      let deduped: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (deduped = t));
      tick();

      expect(client.tokenCalls).toBe(2); // joined the forced request still in flight

      fresh.resolve(ok({ token: 'jwt-fresh' }));
      tick();

      expect(deduped).toBe('jwt-fresh');
    }));

    it('drops a token response that lands after the session changed', fakeAsync(() => {
      const service = setup();
      tick();

      const late = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [late.promise];

      let stale: string | null = 'sentinel' as never;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (stale = t));

      client.sessionResult = ok(session('s2'));
      void service.refreshSession();
      tick();

      late.resolve(ok({ token: 'jwt-for-s1' }));
      tick();

      expect(stale).toBeNull(); // belongs to the previous session, never surfaced

      client.tokenResult = ok({ token: 'jwt-for-s2' });
      let next: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (next = t));
      tick();

      expect(next).toBe('jwt-for-s2');
      expect(client.tokenCalls).toBe(2);
    }));

    it('drops a token rejection that lands after the session changed', fakeAsync(() => {
      const service = setup();
      tick();

      const late = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [late.promise];

      let stale: string | null = 'sentinel' as never;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (stale = t));

      client.sessionResult = ok(session('s2'));
      void service.refreshSession();
      tick();

      late.reject(new Error('late failure'));
      tick();

      expect(stale).toBeNull();
      expect(service.error()).toBeUndefined(); // failure of a superseded exchange is not surfaced
    }));
  });

  describe('token error race', () => {
    it('does not surface a superseded exchange failure once the current exchange succeeded', fakeAsync(() => {
      const service = setup();
      tick();

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: true });
      void service.fetchAccessToken({ forceRefreshToken: true });

      fresh.resolve(ok({ token: 'jwt-fresh' }));
      tick();
      expect(service.error()).toBeUndefined();

      stale.resolve(fail(500, 'late failure')); // the superseded request fails afterwards
      tick();

      expect(service.error()).toBeUndefined(); // a valid token is cached; nothing is broken

      let cached: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
      tick();
      expect(cached).toBe('jwt-fresh');
    }));

    it('does not surface a superseded exchange rejection once the current exchange succeeded', fakeAsync(() => {
      const service = setup();
      tick();

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: true });
      void service.fetchAccessToken({ forceRefreshToken: true });

      fresh.resolve(ok({ token: 'jwt-fresh' }));
      tick();

      stale.reject(new Error('late failure')); // the superseded request rejects afterwards
      tick();

      expect(service.error()).toBeUndefined();

      let cached: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (cached = t));
      tick();
      expect(cached).toBe('jwt-fresh');
    }));

    it('keeps the current exchange failure standing when a superseded exchange succeeds later', fakeAsync(() => {
      const service = setup();
      tick();

      const stale = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      const fresh = createDeferred<BetterAuthFetchResult<{ token?: string | null }>>();
      client.tokenQueue = [stale.promise, fresh.promise];

      void service.fetchAccessToken({ forceRefreshToken: true });
      void service.fetchAccessToken({ forceRefreshToken: true });

      fresh.resolve(fail(500, 'exchange exploded'));
      tick();
      expect(service.error()?.message).toMatch(/token exchange failed: exchange exploded/);

      stale.resolve(ok({ token: 'jwt-stale' })); // the superseded request succeeds afterwards
      tick();

      // The stale token was refused by the cache, so it cannot count as recovery.
      expect(service.error()?.message).toMatch(/token exchange failed: exchange exploded/);

      client.tokenResult = ok({ token: 'jwt-next' });
      let next: string | null = null;
      void service.fetchAccessToken({ forceRefreshToken: false }).then((t) => (next = t));
      tick();
      expect(next).toBe('jwt-next'); // never served the stale token
    }));
  });

  describe('error sequencing', () => {
    it('keeps a session error visible after a subsequent successful token exchange', fakeAsync(() => {
      const service = setup();
      tick();

      client.sessionResult = fail(500, 'session boom');
      client.sessionDataFallback = session('s1'); // keeps the user authenticated
      void service.refreshSession();
      tick();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.error()?.message).toContain('session boom');

      void service.fetchAccessToken({ forceRefreshToken: false });
      tick();

      expect(service.error()?.message).toContain('session boom');
    }));

    it('keeps a token error visible after a subsequent successful session refresh', fakeAsync(() => {
      const service = setup();
      tick();

      client.tokenResult = fail(500, 'token boom');
      void service.fetchAccessToken({ forceRefreshToken: true });
      tick();
      expect(service.error()?.message).toContain('token boom');

      void service.refreshSession();
      tick();

      expect(service.error()?.message).toContain('token boom');
    }));

    it('reports the most recent failure when both sources are failing', fakeAsync(() => {
      const service = setup();
      tick();

      client.sessionResult = fail(500, 'session boom');
      client.sessionDataFallback = session('s1'); // keeps the user authenticated
      void service.refreshSession();
      tick();
      expect(service.error()?.message).toContain('session boom');

      client.tokenResult = fail(500, 'token boom');
      void service.fetchAccessToken({ forceRefreshToken: true });
      tick();
      expect(service.error()?.message).toContain('token boom');

      client.sessionResult = fail(500, 'session boom again');
      void service.refreshSession();
      tick();

      expect(service.error()?.message).toContain('session boom again');
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
