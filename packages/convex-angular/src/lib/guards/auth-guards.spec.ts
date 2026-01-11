import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { ConvexClient } from 'convex/browser';

import { provideConvexAuth } from '../providers/inject-auth';
import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { CONVEX } from '../tokens/convex';
import { CONVEX_AUTH_GUARD_CONFIG, convexAuthGuard } from './auth-guards';

describe('Auth Guards', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;
  let isLoading: ReturnType<typeof signal<boolean>>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    mockSetAuth = jest.fn((_fetchToken, onChange) => {
      setAuthOnChange = onChange;
    });

    mockConvexClient = {
      setAuth: mockSetAuth,
    } as unknown as jest.Mocked<ConvexClient>;

    isLoading = signal(false);
    isAuthenticated = signal(false);
    setAuthOnChange = undefined;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('convexAuthGuard', () => {
    @Component({
      template: 'Dashboard',
      standalone: true,
    })
    class DashboardComponent {}

    @Component({
      template: 'Login',
      standalone: true,
    })
    class LoginComponent {}

    @Component({
      template: 'Home',
      standalone: true,
    })
    class HomeComponent {}

    const routes: Routes = [
      { path: '', component: HomeComponent },
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [convexAuthGuard],
      },
      { path: 'login', component: LoginComponent },
    ];

    function setupTestBed(customConfig?: { loginRoute?: string }) {
      const mockProvider: ConvexAuthProvider = {
        isLoading,
        isAuthenticated,
        fetchAccessToken: async () => 'token',
      };

      const providers = [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useValue: mockProvider },
        provideConvexAuth(),
        provideRouter(routes),
      ];

      if (customConfig) {
        providers.push({
          provide: CONVEX_AUTH_GUARD_CONFIG,
          useValue: customConfig,
        });
      }

      TestBed.configureTestingModule({ providers });
    }

    it('should redirect to /login when not authenticated', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);
      setupTestBed();

      const router = TestBed.inject(Router);

      router.navigate(['/dashboard']);
      tick();
      flush();

      expect(router.url).toBe('/login');
    }));

    it('should use custom login route from config', fakeAsync(() => {
      isLoading.set(false);
      isAuthenticated.set(false);

      @Component({
        template: 'Custom Login',
        standalone: true,
      })
      class CustomLoginComponent {}

      const customRoutes: Routes = [
        { path: '', component: HomeComponent },
        {
          path: 'dashboard',
          component: DashboardComponent,
          canActivate: [convexAuthGuard],
        },
        { path: 'auth/signin', component: CustomLoginComponent },
      ];

      const mockProvider: ConvexAuthProvider = {
        isLoading,
        isAuthenticated,
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
          provideRouter(customRoutes),
          {
            provide: CONVEX_AUTH_GUARD_CONFIG,
            useValue: { loginRoute: '/auth/signin' },
          },
        ],
      });

      const router = TestBed.inject(Router);

      router.navigate(['/dashboard']);
      tick();
      flush();

      expect(router.url).toBe('/auth/signin');
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
