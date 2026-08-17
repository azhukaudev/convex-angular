import { Component, Directive, TemplateRef, ViewContainerRef, inject, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockAuthRegistration, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { provideConvexAuth } from '../providers/inject-auth';
import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import {
  CvaAuthLoadingDirective,
  CvaAuthRefreshingDirective,
  CvaAuthenticatedDirective,
  CvaUnauthenticatedDirective,
} from './auth-helpers';

function requireLastAuthRegistration(convex: MockConvexClient): MockAuthRegistration {
  const registration = convex.lastAuthRegistration();
  if (!registration) {
    throw new Error('Expected a captured auth registration');
  }
  return registration;
}

describe('Auth Helper Directives', () => {
  let convex: MockConvexClient;
  let isLoading: ReturnType<typeof signal<boolean>>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    convex = new MockConvexClient();

    isLoading = signal(true);
    isAuthenticated = signal(false);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setupTestBed() {
    const mockProvider: ConvexAuthProvider = {
      isLoading,
      isAuthenticated,
      fetchAccessToken: async () => 'token',
    };

    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), { provide: CONVEX_AUTH, useValue: mockProvider }, provideConvexAuth()],
    });
  }

  describe('CvaAuthenticatedDirective', () => {
    it('should not render when loading', fakeAsync(() => {
      setupTestBed();

      @Component({
        template: `<div *cvaAuthenticated>Authenticated content</div>`,
        standalone: true,
        imports: [CvaAuthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Authenticated content');
    }));

    it('should not render when not authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthenticated>Authenticated content</div>`,
        standalone: true,
        imports: [CvaAuthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Authenticated content');
    }));

    it('should render when authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthenticated>Authenticated content</div>`,
        standalone: true,
        imports: [CvaAuthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Authenticated content');
    }));

    it('should hide when authentication is lost', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthenticated>Authenticated content</div>`,
        standalone: true,
        imports: [CvaAuthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Authenticated content');

      // User logs out
      isAuthenticated.set(false);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Authenticated content');
    }));
  });

  describe('CvaUnauthenticatedDirective', () => {
    it('should not render when loading', fakeAsync(() => {
      setupTestBed();

      @Component({
        template: `<div *cvaUnauthenticated>Login form</div>`,
        standalone: true,
        imports: [CvaUnauthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Login form');
    }));

    it('should render when not authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);
      setupTestBed();

      @Component({
        template: `<div *cvaUnauthenticated>Login form</div>`,
        standalone: true,
        imports: [CvaUnauthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Login form');
    }));

    it('should not render when authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaUnauthenticated>Login form</div>`,
        standalone: true,
        imports: [CvaUnauthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Login form');
    }));

    it('should show when authentication is lost', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaUnauthenticated>Login form</div>`,
        standalone: true,
        imports: [CvaUnauthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Login form');

      // User logs out
      isAuthenticated.set(false);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Login form');
    }));
  });

  describe('CvaAuthLoadingDirective', () => {
    it('should render when loading', fakeAsync(() => {
      setupTestBed();

      @Component({
        template: `<div *cvaAuthLoading>Loading...</div>`,
        standalone: true,
        imports: [CvaAuthLoadingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Loading...');
    }));

    it('should not render when not loading (unauthenticated)', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthLoading>Loading...</div>`,
        standalone: true,
        imports: [CvaAuthLoadingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
    }));

    it('should not render when not loading (authenticated)', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthLoading>Loading...</div>`,
        standalone: true,
        imports: [CvaAuthLoadingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
    }));

    it('should show when going back to loading', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthLoading>Loading...</div>`,
        standalone: true,
        imports: [CvaAuthLoadingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Loading...');

      // Go back to loading
      isLoading.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Loading...');
    }));
  });

  describe('CvaAuthRefreshingDirective', () => {
    it('should not render while authenticated and not refreshing', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthRefreshing>Reconnecting…</div>`,
        standalone: true,
        imports: [CvaAuthRefreshingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Reconnecting…');
    }));

    it('should render when refreshing while authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(true);
      setupTestBed();

      @Component({
        template: `<div *cvaAuthRefreshing>Reconnecting…</div>`,
        standalone: true,
        imports: [CvaAuthRefreshingDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastAuthRegistration(convex).setAuthenticated(true);
      requireLastAuthRegistration(convex).setRefreshing(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Reconnecting…');

      requireLastAuthRegistration(convex).setRefreshing(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Reconnecting…');
    }));
  });

  describe('view ownership', () => {
    // Renders the template it is attached to, unconditionally, into the same
    // view container the auth directive uses.
    @Directive({
      selector: '[cvaTestSibling]',
      standalone: true,
    })
    class SiblingViewDirective {
      constructor() {
        const templateRef = inject(TemplateRef);
        inject(ViewContainerRef).createEmbeddedView(templateRef);
      }
    }

    it('should leave views it did not create alone while hidden', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);
      setupTestBed();

      @Component({
        template: `<ng-template cvaAuthenticated cvaTestSibling>Sibling content</ng-template>`,
        standalone: true,
        imports: [CvaAuthenticatedDirective, SiblingViewDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Sibling content');
    }));
  });

  describe('Combined usage', () => {
    it('should show correct content based on auth state', fakeAsync(() => {
      setupTestBed();

      @Component({
        template: `
          <div *cvaAuthLoading>Loading...</div>
          <div *cvaAuthenticated>Welcome!</div>
          <div *cvaUnauthenticated>Please sign in</div>
        `,
        standalone: true,
        imports: [CvaAuthLoadingDirective, CvaAuthenticatedDirective, CvaUnauthenticatedDirective],
      })
      class TestComponent {}

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially loading
      expect(fixture.nativeElement.textContent).toContain('Loading...');
      expect(fixture.nativeElement.textContent).not.toContain('Welcome!');
      expect(fixture.nativeElement.textContent).not.toContain('Please sign in');

      // Finish loading, not authenticated
      isLoading.set(false);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
      expect(fixture.nativeElement.textContent).not.toContain('Welcome!');
      expect(fixture.nativeElement.textContent).toContain('Please sign in');

      // Authenticate
      isAuthenticated.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Loading...');
      expect(fixture.nativeElement.textContent).not.toContain('Welcome!');
      expect(fixture.nativeElement.textContent).not.toContain('Please sign in');

      requireLastAuthRegistration(convex).setAuthenticated(true);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
      expect(fixture.nativeElement.textContent).toContain('Welcome!');
      expect(fixture.nativeElement.textContent).not.toContain('Please sign in');
    }));
  });
});
