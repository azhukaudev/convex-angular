import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CONVEX_AUTH, injectAuth } from 'convex-angular';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { BetterAuthClientLike, BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';
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

    // One instance backs both APIs.
    expect(TestBed.inject(CONVEX_AUTH)).toBe(fixture.componentInstance.betterAuth);
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
});
