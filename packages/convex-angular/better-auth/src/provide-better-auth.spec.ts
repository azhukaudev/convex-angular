import { Component, EnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CONVEX_AUTH, injectAuth } from 'convex-angular';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { BetterAuthClientLike, BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';
import { BetterAuthService } from './better-auth.service';
import { injectBetterAuth, provideBetterAuth } from './provide-better-auth';

function fakeClient(): BetterAuthClientLike {
  return {
    getSession: async () =>
      ({
        data: { session: { id: 's1' }, user: { id: 'u1' } },
        error: null,
      }) as BetterAuthFetchResult<BetterAuthSessionData>,
    convex: { token: async () => ({ data: { token: 'jwt-1' }, error: null }) },
  };
}

type SessionResult = BetterAuthFetchResult<BetterAuthSessionData>;

const sessionOf = (id: string): SessionResult => ({ data: { session: { id }, user: { id: 'u1' } }, error: null });
const unauthorized: SessionResult = { data: null, error: { status: 401 } };

describe('provideBetterAuth', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('registers the service as CONVEX_AUTH and exposes it via injectBetterAuth', fakeAsync(() => {
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
    // getSession() answers `fallback` unless a refresh is being held open.
    function setup(fallback: SessionResult) {
      let held: Promise<SessionResult> | null = null;
      const client: BetterAuthClientLike = {
        getSession: () => held ?? Promise.resolve(fallback),
        convex: { token: async () => ({ data: { token: 'jwt-1' }, error: null }) },
      };
      const convex = new MockConvexClient();
      TestBed.configureTestingModule({ providers: [provideConvexTesting(convex), provideBetterAuth(() => client)] });
      const { auth, betterAuth } = TestBed.runInInjectionContext(() => ({
        auth: injectAuth(),
        betterAuth: injectBetterAuth(),
      }));
      return {
        convex,
        auth,
        betterAuth,
        /** Hold the next getSession() call open until the returned function is called. */
        holdNextRefresh: () => {
          let resolve!: (result: SessionResult) => void;
          held = new Promise<SessionResult>((r) => (resolve = r));
          return (result: SessionResult) => {
            held = null;
            resolve(result);
          };
        },
      };
    }

    function settleSignedIn(stack: ReturnType<typeof setup>): void {
      tick();
      TestBed.tick();
      stack.convex.seedAuth({ token: 'jwt-1', decoded: { sub: 'u1' } });
      stack.convex.requireLastAuthRegistration().setAuthenticated(true);
      TestBed.tick();
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

      const resolveRefresh = stack.holdNextRefresh();
      let settled = false;
      void stack.betterAuth.refreshSession().then(() => (settled = true));
      TestBed.tick();
      record();

      expect(stack.betterAuth.isLoading()).toBe(true);
      expect(stack.auth.isAuthenticated()).toBe(true);
      expect(stack.auth.status()).toBe('authenticated');
      expect(stack.convex.clearAuthCount).toBe(0);

      resolveRefresh(sessionOf('s1'));
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

    it('re-authenticates when the refreshed session has a different id', fakeAsync(() => {
      const stack = setup(sessionOf('s1'));
      settleSignedIn(stack);

      const resolveRefresh = stack.holdNextRefresh();
      void stack.betterAuth.refreshSession();
      TestBed.tick();
      expect(stack.convex.clearAuthCount).toBe(0);
      expect(stack.convex.authRegistrations).toHaveLength(1);

      resolveRefresh(sessionOf('s2'));
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

      const resolveRefresh = stack.holdNextRefresh();
      void stack.betterAuth.refreshSession();
      TestBed.tick();
      expect(stack.auth.status()).toBe('loading');

      resolveRefresh(sessionOf('s1'));
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

      const resolveRefresh = stack.holdNextRefresh();
      void stack.betterAuth.refreshSession();
      TestBed.tick();

      resolveRefresh(unauthorized);
      tick();
      TestBed.tick();

      expect(stack.auth.status()).toBe('unauthenticated');
      expect(stack.convex.clearAuthCount).toBe(1);
    }));
  });
});
