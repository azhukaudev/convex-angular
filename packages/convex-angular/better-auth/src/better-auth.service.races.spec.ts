import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';
import { FakeBetterAuthClient, createDeferred, fail, ok, session } from './better-auth-client.fake';
import { BETTER_AUTH_CLIENT_FACTORY, BetterAuthService } from './better-auth.service';

describe('BetterAuthService races', () => {
  let client: FakeBetterAuthClient;

  function setup(): BetterAuthService {
    TestBed.configureTestingModule({
      providers: [
        BetterAuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: BETTER_AUTH_CLIENT_FACTORY, useValue: () => client },
      ],
    });
    return TestBed.inject(BetterAuthService);
  }

  beforeEach(() => {
    client = new FakeBetterAuthClient();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
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

      let stale: string | null = 'sentinel';
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

      let stale: string | null = 'sentinel';
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
});
