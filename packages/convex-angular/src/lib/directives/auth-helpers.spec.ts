import { Component, Directive, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  MockConvexAuthProvider,
  MockConvexClient,
  provideConvexAuthTesting,
  provideConvexTesting,
} from 'convex-angular/testing';

import {
  CvaAuthLoadingDirective,
  CvaAuthRefreshingDirective,
  CvaAuthenticatedDirective,
  CvaUnauthenticatedDirective,
} from './auth-helpers';

describe('Auth Helper Directives', () => {
  let convex: MockConvexClient;
  let provider: MockConvexAuthProvider;

  beforeEach(() => {
    convex = new MockConvexClient();

    provider = new MockConvexAuthProvider({ initiallyLoading: true });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setupTestBed() {
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex), provideConvexAuthTesting(provider)],
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
      provider.setLoading(false);
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
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Authenticated content');
    }));

    it('should hide when authentication is lost', fakeAsync(() => {
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Authenticated content');

      // User logs out
      provider.signOut();
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
      provider.setLoading(false);
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
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Login form');
    }));

    it('should show when authentication is lost', fakeAsync(() => {
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Login form');

      // User logs out
      provider.signOut();
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
      provider.setLoading(false);
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
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
    }));

    it('should show when going back to loading', fakeAsync(() => {
      provider.signIn();
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
      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Loading...');

      // Go back to loading
      provider.setLoading(true);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Loading...');
    }));
  });

  describe('CvaAuthRefreshingDirective', () => {
    it('should not render while authenticated and not refreshing', fakeAsync(() => {
      provider.signIn();
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

      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Reconnecting…');
    }));

    it('should render when refreshing while authenticated', fakeAsync(() => {
      provider.signIn();
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

      convex.requireLastAuthRegistration().setAuthenticated(true);
      convex.requireLastAuthRegistration().setRefreshing(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Reconnecting…');

      convex.requireLastAuthRegistration().setRefreshing(false);
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
      provider.setLoading(false);
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
      provider.setLoading(false);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
      expect(fixture.nativeElement.textContent).not.toContain('Welcome!');
      expect(fixture.nativeElement.textContent).toContain('Please sign in');

      // Authenticate
      provider.signIn();
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).toContain('Loading...');
      expect(fixture.nativeElement.textContent).not.toContain('Welcome!');
      expect(fixture.nativeElement.textContent).not.toContain('Please sign in');

      convex.requireLastAuthRegistration().setAuthenticated(true);
      fixture.detectChanges();
      tick();

      expect(fixture.nativeElement.textContent).not.toContain('Loading...');
      expect(fixture.nativeElement.textContent).toContain('Welcome!');
      expect(fixture.nativeElement.textContent).not.toContain('Please sign in');
    }));
  });
});
