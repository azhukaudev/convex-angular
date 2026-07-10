import { Route } from '@angular/router';
import { CONVEX_AUTH_GUARD_CONFIG, convexAuthGuard, provideConvex } from 'convex-angular';
import { provideBetterAuth } from 'convex-angular/better-auth';

import { environment } from '../../environments/environment';
import { demoAuthClientFactory } from '../auth/auth-client';
import { DemoAuthService } from '../auth/demo-auth.service';

export const AUTH_ROUTES: Route[] = [
  {
    path: 'login',
    providers: [provideConvex(environment.convexUrl), provideBetterAuth(demoAuthClientFactory), DemoAuthService],
    loadComponent: () => import('../pages/auth-login/auth-login'),
  },
  {
    path: 'success',
    providers: [
      provideConvex(environment.convexUrl),
      provideBetterAuth(demoAuthClientFactory),
      DemoAuthService,
      {
        provide: CONVEX_AUTH_GUARD_CONFIG,
        useValue: {
          loginRoute: '/auth/login',
        },
      },
    ],
    canActivate: [convexAuthGuard],
    loadComponent: () => import('../pages/auth-success/auth-success'),
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
];
