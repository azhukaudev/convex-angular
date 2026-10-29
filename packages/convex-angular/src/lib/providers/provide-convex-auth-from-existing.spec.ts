import { Component, EnvironmentInjector, Injectable, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { injectAuth, provideConvexAuth, provideConvexAuthFromExisting } from './inject-auth';

@Injectable()
class ExistingAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly error = signal<Error | undefined>(undefined);
  readonly fetchAccessToken = jest.fn(async () => 'token');
}

describe('provideConvexAuthFromExisting', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('reuses the existing auth provider instance', fakeAsync(() => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
      ],
    });

    const existingProvider = TestBed.inject(ExistingAuthProvider);
    const providerViaToken = TestBed.inject(CONVEX_AUTH);

    expect(providerViaToken).toBe(existingProvider);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');

    existingProvider.isAuthenticated.set(true);
    fixture.detectChanges();
    tick();

    expect(convex.authRegistrations).toHaveLength(1);
  }));

  it('throws when combined with provideConvexAuth in the same injector', () => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/registered more than once in the same injector/);
  });

  it('throws when registered in a child injector after parent auth is configured', () => {
    const convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [
        provideConvexTesting(convex),
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
      ],
    });

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() =>
      createEnvironmentInjector(
        [ExistingAuthProvider, provideConvexAuthFromExisting(ExistingAuthProvider)],
        rootInjector,
      ),
    ).toThrow(/must be configured only in your root application providers/);
  });
});
