import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { injectAuth } from 'convex-angular';

import { MockConvexAuthProvider, provideConvexAuthTesting } from './mock-auth-provider';
import { MockConvexClient, provideConvexTesting } from './mock-convex-client';

describe('MockConvexAuthProvider', () => {
  let provider: MockConvexAuthProvider;

  beforeEach(() => {
    provider = new MockConvexAuthProvider();
  });

  it('starts signed out, not loading, with the default token', async () => {
    expect(provider.isLoading()).toBe(false);
    expect(provider.isAuthenticated()).toBe(false);
    expect(provider.error()).toBeUndefined();
    expect(provider.reauthVersion()).toBe(0);
    expect(provider.token).toBe('test-token');

    await expect(provider.fetchAccessToken({ forceRefreshToken: false })).resolves.toBe('test-token');
  });

  it('honors an explicit null token, the signed-out shape', async () => {
    const signedOut = new MockConvexAuthProvider({ token: null });

    expect(signedOut.token).toBeNull();
    await expect(signedOut.fetchAccessToken({ forceRefreshToken: false })).resolves.toBeNull();
  });

  it('honors constructor options', () => {
    const signedIn = new MockConvexAuthProvider({
      initiallyAuthenticated: true,
      initiallyLoading: true,
      token: 'seeded-token',
    });

    expect(signedIn.isAuthenticated()).toBe(true);
    expect(signedIn.isLoading()).toBe(true);
    expect(signedIn.token).toBe('seeded-token');
  });

  it('setLoading toggles isLoading independently of isAuthenticated', () => {
    provider.setLoading(true);

    expect(provider.isLoading()).toBe(true);
    expect(provider.isAuthenticated()).toBe(false);

    provider.setLoading(false);

    expect(provider.isLoading()).toBe(false);
  });

  it('signIn sets isAuthenticated, clears isLoading, and can set the token', () => {
    provider.setLoading(true);

    provider.signIn('fresh-token');

    expect(provider.isAuthenticated()).toBe(true);
    expect(provider.isLoading()).toBe(false);
    expect(provider.token).toBe('fresh-token');
  });

  it('signIn without a token argument leaves the current token unchanged', () => {
    provider.token = 'unchanged-token';

    provider.signIn();

    expect(provider.token).toBe('unchanged-token');
    expect(provider.isAuthenticated()).toBe(true);
  });

  it('signOut clears the token and isAuthenticated', () => {
    provider.signIn('fresh-token');

    provider.signOut();

    expect(provider.isAuthenticated()).toBe(false);
    expect(provider.token).toBeNull();
  });

  it('fetchAccessToken resolves the current token and records the call', async () => {
    provider.signIn('fresh-token');

    const result = await provider.fetchAccessToken({ forceRefreshToken: true });

    expect(result).toBe('fresh-token');
    expect(provider.fetchCalls).toEqual([{ forceRefreshToken: true }]);

    await provider.fetchAccessToken({ forceRefreshToken: false });

    expect(provider.fetchCalls).toEqual([{ forceRefreshToken: true }, { forceRefreshToken: false }]);
  });

  it('failNextFetch rejects exactly once, then resolves normally again', async () => {
    const failure = new Error('provider exploded');
    provider.failNextFetch(failure);

    await expect(provider.fetchAccessToken({ forceRefreshToken: false })).rejects.toBe(failure);
    await expect(provider.fetchAccessToken({ forceRefreshToken: false })).resolves.toBe(provider.token);
  });

  it('setError sets and clears the provider-owned error', () => {
    const failure = new Error('upstream failed');

    provider.setError(failure);
    expect(provider.error()).toBe(failure);

    provider.setError(undefined);
    expect(provider.error()).toBeUndefined();
  });

  it('bumpReauth increments reauthVersion', () => {
    expect(provider.reauthVersion()).toBe(0);

    provider.bumpReauth();
    provider.bumpReauth();

    expect(provider.reauthVersion()).toBe(2);
  });

  describe('provideConvexAuthTesting', () => {
    afterEach(() => {
      TestBed.resetTestingModule();
    });

    it('makes injectAuth() injectable and reaches unauthenticated', fakeAsync(() => {
      const convex = new MockConvexClient();

      TestBed.configureTestingModule({
        providers: [provideConvexTesting(convex), provideConvexAuthTesting(provider)],
      });

      @Component({ template: '', standalone: true })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');

      provider.signIn();
      fixture.detectChanges();
      tick();

      const registration = convex.lastAuthRegistration();
      expect(registration).toBeDefined();
      registration?.setAuthenticated(true);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    }));
  });
});
