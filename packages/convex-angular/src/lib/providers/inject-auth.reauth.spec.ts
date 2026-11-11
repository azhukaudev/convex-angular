import { Component, Signal, computed, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { injectAuth, provideConvexAuth } from './inject-auth';

interface Session {
  id: string;
  organizationId: string;
  accessToken: string;
}

describe('injectAuth reauthVersion', () => {
  let convex: MockConvexClient;
  const session = signal<Session>({ id: 's1', organizationId: 'o1', accessToken: 't1' });

  function signIn(reauthVersion: Signal<unknown>): void {
    const provider: ConvexAuthProvider = {
      isLoading: signal(false),
      isAuthenticated: signal(true),
      reauthVersion,
      fetchAccessToken: async () => session().accessToken,
    };
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), { provide: CONVEX_AUTH, useValue: provider }, provideConvexAuth()],
    });

    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly auth = injectAuth();
    }

    TestBed.createComponent(TestComponent).detectChanges();
    tick();
  }

  // What a token refresh does to a provider that stores the token in its session.
  function refreshToken(): void {
    session.update((current) => ({ ...current, accessToken: `${current.accessToken}+` }));
    tick();
  }

  beforeEach(() => {
    convex = new MockConvexClient();
    session.set({ id: 's1', organizationId: 'o1', accessToken: 't1' });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not rerun auth setup when a primitive key is unchanged by a token refresh', fakeAsync(() => {
    signIn(computed(() => `${session().id}:${session().organizationId}`));
    expect(convex.authRegistrations).toHaveLength(1);

    refreshToken();

    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('reruns auth setup when the primitive key changes', fakeAsync(() => {
    signIn(computed(() => `${session().id}:${session().organizationId}`));

    session.update((current) => ({ ...current, organizationId: 'o2' }));
    tick();

    expect(convex.authRegistrations).toHaveLength(2);
  }));

  it('reruns auth setup on every token refresh when the key is a fresh array', fakeAsync(() => {
    signIn(computed(() => [session().id, session().organizationId]));

    refreshToken();
    refreshToken();

    expect(convex.authRegistrations).toHaveLength(3);
  }));
});
