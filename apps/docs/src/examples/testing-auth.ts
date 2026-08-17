import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CONVEX_AUTH, ConvexAuthProvider, injectAuth, provideConvexAuth } from 'convex-angular';
import { MockAuthRegistration, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

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

/**
 * A minimal `ConvexAuthProvider` standing in for Clerk, Auth0 or Better Auth.
 * The test flips its signals to model the identity provider; the mock's auth
 * registration models Convex answering back.
 */
class FakeAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);

  /** What the identity provider's token endpoint hands back. */
  token: string | null = 'jwt-token';
  /** How many times Convex asked for a bypass-the-cache token. */
  forceRefreshCount = 0;

  fetchAccessToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
    if (forceRefreshToken) {
      this.forceRefreshCount += 1;
    }
    return this.token;
  };
}

describe('AccountBadge', () => {
  let convex: MockConvexClient;
  let provider: FakeAuthProvider;

  beforeEach(() => {
    convex = new MockConvexClient();
    provider = new FakeAuthProvider();

    TestBed.configureTestingModule({
      imports: [AccountBadge],
      providers: [
        provideConvexTesting(convex),
        { provide: CONVEX_AUTH, useValue: provider },
        // `provideConvexAuth()` is what calls `client.setAuth`, so the mock
        // captures nothing until it is registered.
        provideConvexAuth(),
      ],
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

  /** `lastAuthRegistration()` is optional; narrow it once instead of at every call site. */
  function lastRegistration(): MockAuthRegistration {
    const registration = convex.lastAuthRegistration();
    if (!registration) {
      throw new Error('Expected the helper to have registered auth with the client');
    }
    return registration;
  }

  it('stays loading until Convex confirms the token', fakeAsync(() => {
    provider.isAuthenticated.set(true);
    const fixture = createFixture();

    // The provider says signed in, so auth was registered — but nobody has
    // confirmed the token yet.
    expect(convex.authRegistrations).toHaveLength(1);
    expect(fixture.componentInstance.auth.status()).toBe('loading');

    lastRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('asks the provider for a fresh token when Convex forces a refresh', fakeAsync(() => {
    provider.isAuthenticated.set(true);
    createFixture();

    let resolved: string | null | undefined;
    lastRegistration()
      .fetchToken({ forceRefreshToken: true })
      .then((token) => (resolved = token));
    tick();

    expect(provider.forceRefreshCount).toBe(1);
    expect(resolved).toBe('jwt-token');
  }));

  it('reports the refreshing status while a token is renewed', fakeAsync(() => {
    provider.isAuthenticated.set(true);
    const fixture = createFixture();

    lastRegistration().setAuthenticated(true);
    lastRegistration().setRefreshing(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('refreshing');

    lastRegistration().setRefreshing(false);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('authenticated');
  }));

  it('renders the claims the client holds', fakeAsync(() => {
    // `seedAuth` is the client's token: it is what `getAuth()` reports and what
    // makes `client.hasAuth()` true. Registering a fetcher does neither.
    convex.seedAuth({ token: 'jwt-token', decoded: { sub: 'user-1' } });
    provider.isAuthenticated.set(true);
    const fixture = createFixture();

    lastRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    expect(fixture.nativeElement.textContent).toContain('Signed in as user-1');
  }));

  it('clears the held token when the user signs out', fakeAsync(() => {
    convex.seedAuth({ token: 'jwt-token', decoded: { sub: 'user-1' } });
    provider.isAuthenticated.set(true);
    const fixture = createFixture();

    lastRegistration().setAuthenticated(true);
    fixture.detectChanges();
    tick();

    const registration = lastRegistration();
    provider.isAuthenticated.set(false);
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
    provider.isLoading.set(true);
    createFixture();

    expect(convex.hasAuthCount).toBeGreaterThan(0);
    expect(convex.clearAuthCount).toBe(0);
  }));

  it('clears a token the client was already holding', fakeAsync(() => {
    // A token seeded before the fixture exists stands in for a client that was
    // already authenticated when this component was created.
    convex.seedAuth({ token: 'stale-token', decoded: { sub: 'user-1' } });
    provider.isLoading.set(true);
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

    provider.isAuthenticated.set(true);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    expect(fixture.componentInstance.auth.error()?.message).toContain('sync exploded');
  }));
});
