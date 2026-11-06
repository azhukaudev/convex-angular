import { Component, EnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CONVEX_AUTH, injectAuth } from 'convex-angular';
import { MockConvexClient, provideConvexTesting, type MockAuthRegistration } from 'convex-angular/testing';

import { FakeBetterAuthClient, createDeferred, fail, ok, session } from './better-auth-client.fake';
import { BetterAuthService } from './better-auth.service';
import { injectBetterAuth, provideBetterAuth } from './provide-better-auth';

const fakeClient = () => new FakeBetterAuthClient();

type SessionResult = FakeBetterAuthClient['sessionResult'];

const sessionOf = (id: string): SessionResult => ok(session(id));
const unauthorized: SessionResult = fail(401);

describe('provideBetterAuth', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('registers the Convex-facing view of the service as CONVEX_AUTH and exposes the service via injectBetterAuth', fakeAsync(() => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient()), provideBetterAuth(fakeClient)],
    });

    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly betterAuth = injectBetterAuth();
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // One service backs both APIs.
    const convexAuth = TestBed.inject(CONVEX_AUTH);
    expect(convexAuth.isAuthenticated()).toBe(fixture.componentInstance.betterAuth.isAuthenticated());
    let token: string | null | undefined;
    void convexAuth.fetchAccessToken({ forceRefreshToken: false }).then((value) => (token = value));
    tick();
    expect(token).toBe('jwt-1');
    expect(fixture.componentInstance.betterAuth.session()?.session.id).toBe('s1');
    expect(fixture.componentInstance.betterAuth.isAuthenticated()).toBe(true);
  }));

  it('invokes the client factory lazily in an injection context', fakeAsync(() => {
    const seen = signal<string | null>(null);
    let constructed = 0;

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(new MockConvexClient()),
        provideBetterAuth(() => {
          constructed += 1;
          seen.set('built');
          return fakeClient();
        }),
      ],
    });

    expect(constructed).toBe(0); // nothing until first injection

    TestBed.runInInjectionContext(() => injectBetterAuth());
    tick();

    expect(constructed).toBe(1);
    expect(seen()).toBe('built');
  }));

  it('resolves the session state from an explicit injector outside an injection context', fakeAsync(() => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient()), provideBetterAuth(fakeClient)],
    });
    const injector = TestBed.inject(EnvironmentInjector);

    // No ambient injection context here: the injectRef escape hatch is the
    // only thing that can resolve the service.
    const state = injectBetterAuth({ injectRef: injector });
    tick();

    expect(state).toBe(TestBed.inject(BetterAuthService));
    expect(state.isAuthenticated()).toBe(true);
  }));

  it('throws the root-only guard error on nested registration', () => {
    // provideConvexAuth() is included by provideBetterAuth(); registering a
    // second auth provider setup in the same injector must throw, matching
    // provideClerkAuth()/provideAuth0Auth() semantics.
    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(new MockConvexClient()),
        provideBetterAuth(fakeClient),
        provideBetterAuth(fakeClient),
      ],
    });

    expect(() => TestBed.inject(CONVEX_AUTH)).toThrow(/registered more than once/);
  });

  it('injectBetterAuth() throws a guided error when provideBetterAuth() was not registered', () => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient())],
    });

    expect(() => TestBed.runInInjectionContext(() => injectBetterAuth())).toThrow(/provideBetterAuth/);
  });

  it('injectBetterAuth() throws the guided injection-context error when called from plain code', () => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient()), provideBetterAuth(fakeClient)],
    });

    expect(() => injectBetterAuth()).toThrow(
      /injectBetterAuth\(\) must be called from an injection context[\s\S]*injectRef/,
    );
  });

  it('injectBetterAuth() throws the guided missing-provider error when injectRef has no provideBetterAuth()', () => {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient())],
    });

    expect(() => injectBetterAuth({ injectRef: TestBed.inject(EnvironmentInjector) })).toThrow(
      /Could not find BetterAuthService/,
    );
  });

  describe('same-session refresh', () => {
    function setup(sessionResult: SessionResult) {
      const client = new FakeBetterAuthClient();
      client.sessionResult = sessionResult;
      const convex = new MockConvexClient();
      TestBed.configureTestingModule({ providers: [provideConvexTesting(convex), provideBetterAuth(() => client)] });
      const { auth, betterAuth } = TestBed.runInInjectionContext(() => ({
        auth: injectAuth(),
        betterAuth: injectBetterAuth(),
      }));
      return { client, convex, auth, betterAuth };
    }

    // Plays Convex's side of a successful handshake: the client now holds a token (`hasAuth()`), then reports
    // authenticated.
    function completeHandshake(convex: MockConvexClient, registration: MockAuthRegistration): void {
      convex.seedAuth({ token: 'jwt-1', decoded: { sub: 'u1' } });
      registration.setAuthenticated(true);
      TestBed.tick();
    }

    function settleSignedIn(stack: ReturnType<typeof setup>): void {
      tick();
      TestBed.tick();
      completeHandshake(stack.convex, stack.convex.requireLastAuthRegistration());
      expect(stack.auth.status()).toBe('authenticated');
      expect(stack.convex.authRegistrations).toHaveLength(1);
      expect(stack.convex.clearAuthCount).toBe(0);
    }

    afterEach(() => {
      TestBed.resetTestingModule();
    });

    it('keeps Convex auth steady while the same session is re-validated', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);
      const statuses: string[] = [];
      const record = () => statuses.push(stack.auth.status());

      const refresh = createDeferred<SessionResult>();
      stack.client.sessionQueue.push(refresh.promise);
      let settled = false;
      void stack.betterAuth.refreshSession().then(() => (settled = true));
      TestBed.tick();
      record();

      expect(stack.betterAuth.isLoading()).toBe(true);
      expect(stack.auth.isAuthenticated()).toBe(true);
      expect(stack.auth.status()).toBe('authenticated');
      expect(stack.convex.clearAuthCount).toBe(0);

      refresh.resolve(sessionOf('s1'));
      tick();
      TestBed.tick();
      record();

      expect(settled).toBe(true);
      expect(stack.betterAuth.isLoading()).toBe(false);
      expect(stack.convex.authRegistrations).toHaveLength(1);
      expect(stack.convex.clearAuthCount).toBe(0);
      expect(stack.auth.status()).toBe('authenticated');
      expect(statuses).not.toContain('loading');
    }));

    it('does not re-register Convex auth when the same session is refreshed after a healthy exchange', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);
      void stack.convex.requireLastAuthRegistration().fetchToken({ forceRefreshToken: false });
      tick();

      void stack.betterAuth.refreshSession();
      tick();
      TestBed.tick();

      expect(stack.convex.authRegistrations).toHaveLength(1);
      expect(stack.convex.clearAuthCount).toBe(0);
      expect(stack.auth.status()).toBe('authenticated');
    }));

    it('retries a failed token exchange when the same session is refreshed', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);

      // Convex asks for a token, the exchange fails, and the client gives up on auth.
      stack.client.tokenResult = fail(500, 'exchange exploded');
      const failedRegistration = stack.convex.requireLastAuthRegistration();
      let failedToken: string | null | undefined = 'sentinel';
      void failedRegistration.fetchToken({ forceRefreshToken: true }).then((token) => (failedToken = token));
      tick();
      failedRegistration.setAuthenticated(false);
      TestBed.tick();

      expect(failedToken).toBeNull();
      expect(stack.auth.status()).toBe('unauthenticated');
      expect(stack.betterAuth.isAuthenticated()).toBe(true);
      expect(stack.convex.authRegistrations).toHaveLength(1);

      // The same session is re-read once the server recovers.
      stack.client.tokenResult = ok({ token: 'jwt-1' });
      void stack.betterAuth.refreshSession();
      tick();
      TestBed.tick();
      expect(stack.convex.authRegistrations).toHaveLength(2);

      // The real client fetches a token as soon as auth is registered.
      const retryRegistration = stack.convex.requireLastAuthRegistration();
      let retriedToken: string | null | undefined;
      void retryRegistration.fetchToken({ forceRefreshToken: false }).then((token) => (retriedToken = token));
      tick();
      completeHandshake(stack.convex, retryRegistration);

      expect(retriedToken).toBe('jwt-1');
      expect(stack.auth.status()).toBe('authenticated');
      expect(stack.betterAuth.error()).toBeUndefined();
    }));

    it('re-authenticates when the refreshed session has a different id', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);

      const refresh = createDeferred<SessionResult>();
      stack.client.sessionQueue.push(refresh.promise);
      void stack.betterAuth.refreshSession();
      TestBed.tick();
      expect(stack.convex.clearAuthCount).toBe(0);
      expect(stack.convex.authRegistrations).toHaveLength(1);

      refresh.resolve(sessionOf('s2'));
      tick();
      TestBed.tick();
      expect(stack.convex.authRegistrations).toHaveLength(2);

      stack.convex.requireLastAuthRegistration().setAuthenticated(true);
      TestBed.tick();
      expect(stack.auth.status()).toBe('authenticated');
    }));

    it('still reports loading while a sign-in refresh runs from a signed-out state', fakeAsync(() => {
      const stack = setup(unauthorized);
      tick();
      TestBed.tick();
      expect(stack.auth.status()).toBe('unauthenticated');

      const refresh = createDeferred<SessionResult>();
      stack.client.sessionQueue.push(refresh.promise);
      void stack.betterAuth.refreshSession();
      TestBed.tick();
      expect(stack.auth.status()).toBe('loading');

      refresh.resolve(sessionOf('s1'));
      tick();
      TestBed.tick();
      expect(stack.convex.authRegistrations).toHaveLength(1);

      stack.convex.requireLastAuthRegistration().setAuthenticated(true);
      TestBed.tick();
      expect(stack.auth.status()).toBe('authenticated');
    }));

    it('ends unauthenticated, with one clearAuth, when the re-validated session has expired', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);

      const refresh = createDeferred<SessionResult>();
      stack.client.sessionQueue.push(refresh.promise);
      void stack.betterAuth.refreshSession();
      TestBed.tick();

      refresh.resolve(unauthorized);
      tick();
      TestBed.tick();

      expect(stack.auth.status()).toBe('unauthenticated');
      expect(stack.convex.clearAuthCount).toBe(1);
    }));
  });
});
