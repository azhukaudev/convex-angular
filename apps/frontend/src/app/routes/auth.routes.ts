import { Route } from '@angular/router';
import {
  CONVEX_AUTH,
  CONVEX_AUTH_GUARD_CONFIG,
  convexAuthGuard,
  provideConvex,
  provideConvexAuth,
} from 'convex-angular';

import { environment } from '../../environments/environment';
import { DemoAuthService } from '../auth/demo-auth.service';

export const AUTH_ROUTES: Route[] = [
  {
    path: 'login',
    providers: [DemoAuthService],
    loadComponent: () => import('../pages/auth-login/auth-login'),
  },
  {
    path: 'success',
    providers: [
      DemoAuthService,
      provideConvex(environment.convexUrl),
      {
        provide: CONVEX_AUTH_GUARD_CONFIG,
        useValue: {
          loginRoute: '/auth/login',
        },
      },
      { provide: CONVEX_AUTH, useExisting: DemoAuthService },
      provideConvexAuth(),
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
