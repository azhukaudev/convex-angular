import { Component, EnvironmentProviders, Provider, signal } from '@angular/core';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { MockAuthRegistration, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';

import { provideConvexAuth } from '../providers/inject-auth';
import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import {
  CONVEX_AUTH_GUARD_CONFIG,
  ConvexAuthGuardConfig,
  convexAuthGuard,
  convexUnauthGuard,
  createConvexAuthGuard,
} from './auth-guards';

function requireLastAuthRegistration(convex: MockConvexClient): MockAuthRegistration {
  const registration = convex.lastAuthRegistration();
  if (!registration) {
    throw new Error('Expected a captured auth registration');
  }
  return registration;
}

describe('Auth Guards', () => {
  let convex: MockConvexClient;
  let isLoading: ReturnType<typeof signal<boolean>>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    convex = new MockConvexClient();

    isLoading = signal(false);
    isAuthenticated = signal(false);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  @Component({
    template: 'Page',
    standalone: true,
  })
  class BlankComponent {}

  function setupGuardTestBed(routes: Routes, config?: ConvexAuthGuardConfig): Router {
    const mockProvider: ConvexAuthProvider = {
      isLoading,
      isAuthenticated,
      fetchAccessToken: async () => 'token',
    };

    const providers: Array<Provider | EnvironmentProviders> = [
      provideConvexTesting(convex),
      { provide: CONVEX_AUTH, useValue: mockProvider },
      provideConvexAuth(),
      provideRouter(routes),
    ];

    if (config) {
      providers.push({ provide: CONVEX_AUTH_GUARD_CONFIG, useValue: config });
    }

    TestBed.configureTestingModule({ providers });
    return TestBed.inject(Router);
  }

  function authenticateAndNavigate(router: Router, url: string) {
    router.navigateByUrl(url);
    tick();
    requireLastAuthRegistration(convex).setAuthenticated(true);
    tick();
    flush();
  }

  describe('convexAuthGuard (canActivate)', () => {
    const routes: Routes = [
      { path: '', component: BlankComponent },
      {
        path: 'dashboard',
        component: BlankComponent,
        canActivate: [convexAuthGuard],
      },
      { path: 'login', component: BlankComponent },
    ];

    it('should redirect to /login with returnUrl when not authenticated', fakeAsync(() => {
      const router = setupGuardTestBed(routes);

      router.navigate(['/dashboard']);
      tick();
      flush();

      expect(router.url).toBe('/login?returnUrl=%2Fdashboard');
    }));

    it('should use custom login route from config and preserve its query params', fakeAsync(() => {
      const customRoutes: Routes = [
        { path: '', component: BlankComponent },
        {
          path: 'dashboard',
          component: BlankComponent,
          canActivate: [convexAuthGuard],
        },
        { path: 'auth/signin', component: BlankComponent },
      ];

      const router = setupGuardTestBed(customRoutes, { loginRoute: '/auth/signin?source=guard#entry' });

      router.navigate(['/dashboard']);
      tick();
      flush();

      const redirectUrl = router.parseUrl(router.url);

      expect(router.url.startsWith('/auth/signin?')).toBe(true);
      expect(redirectUrl.queryParams).toEqual({
        source: 'guard',
        returnUrl: '/dashboard',
      });
      expect(redirectUrl.fragment).toBe('entry');
    }));

    it('preserves path, query params, and fragment in returnUrl', fakeAsync(() => {
      const router = setupGuardTestBed(routes);

      router.navigateByUrl('/dashboard?tab=activity#details');
      tick();
      flush();

      const redirectUrl = router.parseUrl(router.url);

      expect(router.url.startsWith('/login?')).toBe(true);
      expect(redirectUrl.queryParams['returnUrl']).toBe('/dashboard?tab=activity#details');
    }));

    it('waits for Convex confirmation before allowing navigation', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes);

      router.navigate(['/dashboard']);
      tick();

      expect(router.url).toBe('/');

      requireLastAuthRegistration(convex).setAuthenticated(true);
      tick();
      flush();

      expect(router.url).toBe('/dashboard');
    }));

    it('allows navigation while a rejected token is being refreshed', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes);

      authenticateAndNavigate(router, '/dashboard');
      expect(router.url).toBe('/dashboard');

      // Server rejects the previously confirmed token: Convex pauses the
      // socket while fetching a replacement. The user is still authenticated.
      requireLastAuthRegistration(convex).setRefreshing(true);
      tick();

      router.navigate(['/']);
      tick();
      flush();
      router.navigate(['/dashboard']);
      tick();
      flush();

      expect(router.url).toBe('/dashboard');
    }));
  });

  describe('convexAuthGuard (canMatch)', () => {
    const routes: Routes = [
      { path: '', component: BlankComponent },
      {
        path: 'dashboard',
        component: BlankComponent,
        canMatch: [convexAuthGuard],
      },
      { path: 'login', component: BlankComponent },
    ];

    it('redirects to /login with returnUrl when not authenticated', fakeAsync(() => {
      const router = setupGuardTestBed(routes);

      router.navigateByUrl('/dashboard?tab=activity#details');
      tick();
      flush();

      const redirectUrl = router.parseUrl(router.url);

      expect(router.url.startsWith('/login?')).toBe(true);
      expect(redirectUrl.queryParams['returnUrl']).toBe('/dashboard?tab=activity#details');
    }));

    it('allows matching once Convex confirms authentication', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes);

      authenticateAndNavigate(router, '/dashboard');

      expect(router.url).toBe('/dashboard');
    }));
  });

  describe('convexUnauthGuard', () => {
    const routes: Routes = [
      { path: '', component: BlankComponent },
      { path: 'home', component: BlankComponent },
      {
        path: 'login',
        component: BlankComponent,
        canActivate: [convexUnauthGuard],
      },
    ];

    it('allows unauthenticated users', fakeAsync(() => {
      const router = setupGuardTestBed(routes);

      router.navigate(['/login']);
      tick();
      flush();

      expect(router.url).toBe('/login');
    }));

    it('redirects authenticated users to / by default', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes);

      authenticateAndNavigate(router, '/login');

      expect(router.url).toBe('/');
    }));

    it('redirects authenticated users while a rejected token is being refreshed', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes);

      authenticateAndNavigate(router, '/home');
      expect(router.url).toBe('/home');

      // Convex is fetching a replacement token; the user stays signed in, so
      // the login route must still bounce them instead of waiting it out.
      requireLastAuthRegistration(convex).setRefreshing(true);
      tick();

      router.navigate(['/login']);
      tick();
      flush();

      expect(router.url).toBe('/');
    }));

    it('redirects authenticated users to the configured authenticatedRoute', fakeAsync(() => {
      isAuthenticated.set(true);
      const router = setupGuardTestBed(routes, { authenticatedRoute: '/home' });

      authenticateAndNavigate(router, '/login');

      expect(router.url).toBe('/home');
    }));
  });

  describe('createConvexAuthGuard', () => {
    function adminRoutes(guardOptions?: Parameters<typeof createConvexAuthGuard>[0]): Routes {
      return [
        { path: '', component: BlankComponent },
        {
          path: 'admin',
          component: BlankComponent,
          canActivate: [createConvexAuthGuard(guardOptions)],
        },
        { path: 'login', component: BlankComponent },
        { path: 'forbidden', component: BlankComponent },
      ];
    }

    it('redirects unauthenticated users to login with returnUrl', fakeAsync(() => {
      const router = setupGuardTestBed(adminRoutes({ allow: () => true }));

      router.navigate(['/admin']);
      tick();
      flush();

      expect(router.url).toBe('/login?returnUrl=%2Fadmin');
    }));

    it('passes the current token and claims to allow', fakeAsync(() => {
      const allow = jest.fn().mockReturnValue(true);
      convex.seedAuth({ token: 'jwt-token', decoded: { role: 'admin' } });
      isAuthenticated.set(true);

      const router = setupGuardTestBed(adminRoutes({ allow }));
      authenticateAndNavigate(router, '/admin');

      expect(allow).toHaveBeenCalledWith({ token: 'jwt-token', claims: { role: 'admin' } });
      expect(router.url).toBe('/admin');
    }));

    it('blocks navigation when allow fails and no forbiddenRoute is set', fakeAsync(() => {
      convex.seedAuth({ token: 'jwt-token', decoded: { role: 'viewer' } });
      isAuthenticated.set(true);

      const router = setupGuardTestBed(adminRoutes({ allow: ({ claims }) => claims['role'] === 'admin' }));
      authenticateAndNavigate(router, '/admin');

      expect(router.url).toBe('/');
    }));

    it('redirects to forbiddenRoute when allow fails', fakeAsync(() => {
      convex.seedAuth({ token: 'jwt-token', decoded: { role: 'viewer' } });
      isAuthenticated.set(true);

      const router = setupGuardTestBed(
        adminRoutes({
          allow: ({ claims }) => claims['role'] === 'admin',
          forbiddenRoute: '/forbidden',
        }),
      );
      authenticateAndNavigate(router, '/admin');

      expect(router.url).toBe('/forbidden');
    }));

    it('blocks when no auth snapshot is available even if authenticated', fakeAsync(() => {
      convex.seedAuth(undefined);
      isAuthenticated.set(true);

      const router = setupGuardTestBed(adminRoutes({ allow: () => true }));
      authenticateAndNavigate(router, '/admin');

      expect(router.url).toBe('/');
    }));

    it('waits for a token refresh to settle before running allow', fakeAsync(() => {
      const allow = jest.fn(({ claims }) => claims['role'] === 'admin');
      isAuthenticated.set(true);

      const router = setupGuardTestBed(adminRoutes({ allow }));
      authenticateAndNavigate(router, '/');

      // The server rejects the token; mid-refresh there is no usable
      // snapshot, so the guard must not run `allow` yet.
      convex.seedAuth(undefined);
      requireLastAuthRegistration(convex).setRefreshing(true);
      tick();

      router.navigate(['/admin']);
      tick();
      flush();
      expect(allow).not.toHaveBeenCalled();
      expect(router.url).toBe('/');

      // The refresh completes with a fresh token; the pending guard decides
      // with the new claims.
      convex.seedAuth({ token: 'fresh-jwt', decoded: { role: 'admin' } });
      requireLastAuthRegistration(convex).setRefreshing(false);
      tick();
      flush();

      expect(allow).toHaveBeenCalledWith({ token: 'fresh-jwt', claims: { role: 'admin' } });
      expect(router.url).toBe('/admin');
    }));

    it('works as a canMatch guard', fakeAsync(() => {
      convex.seedAuth({ token: 'jwt-token', decoded: { role: 'admin' } });
      isAuthenticated.set(true);

      const routes: Routes = [
        { path: '', component: BlankComponent },
        {
          path: 'admin',
          component: BlankComponent,
          canMatch: [createConvexAuthGuard({ allow: ({ claims }) => claims['role'] === 'admin' })],
        },
        { path: 'login', component: BlankComponent },
      ];

      const router = setupGuardTestBed(routes);
      authenticateAndNavigate(router, '/admin');

      expect(router.url).toBe('/admin');
    }));

    it('respects a per-guard loginRoute override', fakeAsync(() => {
      const routes: Routes = [
        { path: '', component: BlankComponent },
        {
          path: 'admin',
          component: BlankComponent,
          canActivate: [createConvexAuthGuard({ loginRoute: '/auth/signin' })],
        },
        { path: 'auth/signin', component: BlankComponent },
      ];

      const router = setupGuardTestBed(routes);

      router.navigate(['/admin']);
      tick();
      flush();

      expect(router.url).toBe('/auth/signin?returnUrl=%2Fadmin');
    }));
  });

  describe('CONVEX_AUTH_GUARD_CONFIG', () => {
    it('should be injectable', () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: CONVEX_AUTH_GUARD_CONFIG,
            useValue: {
              loginRoute: '/auth/login',
            },
          },
        ],
      });

      const config = TestBed.inject(CONVEX_AUTH_GUARD_CONFIG);

      expect(config.loginRoute).toBe('/auth/login');
    });

    it('should name the token when it is injected without a provider', () => {
      TestBed.configureTestingModule({ providers: [] });

      expect(() => TestBed.inject(CONVEX_AUTH_GUARD_CONFIG)).toThrow(/CONVEX_AUTH_GUARD_CONFIG/);
    });

    it('should be optional (return null when not provided)', () => {
      TestBed.configureTestingModule({
        providers: [],
      });

      const injector = TestBed.inject(CONVEX_AUTH_GUARD_CONFIG as any, null, {
        optional: true,
      });

      expect(injector).toBeNull();
    });
  });
});
