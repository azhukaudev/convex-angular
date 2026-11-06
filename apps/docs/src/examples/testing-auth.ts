import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { injectAuth } from 'convex-angular';
import {
  MockConvexAuthProvider,
  MockConvexClient,
  provideConvexAuthTesting,
  provideConvexTesting,
} from 'convex-angular/testing';

@Component({
  selector: 'app-account-badge',
  template: `
    @switch (auth.status()) {
      @case ('loading') {
        <p>Checking your session…</p>
      }
      @case ('refreshing') {
        <p>Refreshing your session…</p>
      }
      @case ('authenticated') {
        <p>Signed in as {{ subject() }}</p>
      }
      @default {
        <p>Signed out</p>
      }
    }
  `,
})
export class AccountBadge {
  readonly auth = injectAuth();

  subject(): string {
    return String(this.auth.getAuth()?.decoded['sub'] ?? 'unknown');
  }
}

describe('AccountBadge', () => {
  let convex: MockConvexClient;
  let provider: MockConvexAuthProvider;

  beforeEach(() => {
    convex = new MockConvexClient();
    provider = new MockConvexAuthProvider({ token: 'jwt-token' });

    TestBed.configureTestingModule({
      imports: [AccountBadge],
      // `MockConvexAuthProvider` plays the identity provider (Clerk, Auth0,
      // Better Auth, your own session service); `provideConvexAuthTesting()`
      // registers it under `CONVEX_AUTH` and calls `provideConvexAuth()`,
      // which is what makes the mock capture `client.setAuth`.
      providers: [provideConvexTesting(convex), provideConvexAuthTesting(provider)],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(AccountBadge);
    fixture.detectChanges();
    tick();
    return fixture;
  }

  it('stays loading until Convex confirms the token', fakeAsync(() => {
    provider.signIn();
    const fixture = createFixture();

    // The provider says signed in, so auth was registered — but nobody has
    // confirmed the token yet.
    expect(convex.authRegistrations).toHaveLength(1);
    expect(fixture.componentInstance.auth.status()).toBe('loading');

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('asks the provider for a fresh token when Convex forces a refresh', fakeAsync(() => {
    provider.signIn();
    createFixture();

    let resolved: string | null | undefined;
    convex
      .requireLastAuthRegistration()
      .fetchToken({ forceRefreshToken: true })
      .then((token) => (resolved = token));
    tick();

    expect(provider.fetchCalls).toContainEqual({ forceRefreshToken: true });
    expect(resolved).toBe('jwt-token');
  }));

  it('reports the refreshing status while a token is renewed', fakeAsync(() => {
    provider.signIn();
    const fixture = createFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    convex.requireLastAuthRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    convex.requireLastAuthRegistration().setRefreshing(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('renders the claims the client holds', fakeAsync(() => {
    // `seedAuth` is the client's token: it is what `getAuth()` reports and what
    // makes `client.hasAuth()` true. Registering a fetcher does neither.
    convex.seedAuth({ token: 'jwt-token', decoded: { sub: 'user-1' } });
    provider.signIn();
    const fixture = createFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.nativeElement.textContent).toContain('Signed in as user-1');
  }));

  it('clears the held token when the user signs out', fakeAsync(() => {
    convex.seedAuth({ token: 'jwt-token', decoded: { sub: 'user-1' } });
    provider.signIn();
    const fixture = createFixture();

    convex.requireLastAuthRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const registration = convex.requireLastAuthRegistration();
    provider.signOut();
    fixture.detectChanges();
    tick();

    expect(convex.hasAuthCount).toBeGreaterThan(0);
    expect(convex.clearAuthCount).toBe(1);
    expect(registration.cleared).toBe(true);
    expect(fixture.componentInstance.auth.getAuth()).toBeUndefined();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');

    // `cleared` records that clearAuth ran; it does not gag the registration.
    // The real client keeps its authentication-manager config after clearAuth,
    // so a stale callback can still arrive — and it is the helper's own
    // generation guard, not the mock, that has to ignore it.
    registration.setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('leaves a client that holds no token alone', fakeAsync(() => {
    // No `seedAuth`, so `hasAuth()` is false: the helper must look, then
    // decide not to clear. `hasAuthCount` is what tells those two apart.
    provider.setLoading(true);
    createFixture();

    expect(convex.hasAuthCount).toBeGreaterThan(0);
    expect(convex.clearAuthCount).toBe(0);
  }));

  it('clears a token the client was already holding', fakeAsync(() => {
    // A token seeded before the fixture exists stands in for a client that was
    // already authenticated when this component was created.
    convex.seedAuth({ token: 'stale-token', decoded: { sub: 'user-1' } });
    provider.setLoading(true);
    createFixture();

    expect(convex.authRegistrations).toHaveLength(0);
    expect(convex.clearAuthCount).toBe(1);
  }));

  it('surfaces a failure raised by the client itself', fakeAsync(() => {
    const fixture = createFixture();

    // Fault injection: the mock cannot arm a throwing `setAuth`, so spy on its
    // own client object. `convex.client` is stable, which is what makes it work.
    jest.spyOn(convex.client, 'setAuth').mockImplementation(() => {
      throw new Error('sync exploded');
    });

    provider.signIn();
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()?.message).toContain('sync exploded');
  }));
});
