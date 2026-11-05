import { Route } from '@angular/router';
import { CONVEX_AUTH_GUARD_CONFIG, convexAuthGuard, provideConvex } from 'convex-angular';
import { provideBetterAuth } from 'convex-angular/better-auth';

import { environment } from '../../environments/environment';
import { demoAuthClientFactory } from '../auth/auth-client';
import { DemoAuthService } from '../auth/demo-auth.service';

export const AUTH_ROUTES: Route[] = [
  {
    path: '',
    providers: [provideConvex(environment.convexUrl), provideBetterAuth(demoAuthClientFactory), DemoAuthService],
    children: [
      {
        path: 'login',
        loadComponent: () => import('../pages/auth-login/auth-login'),
      },
      {
        path: 'success',
        providers: [
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
    ],
  },
];
