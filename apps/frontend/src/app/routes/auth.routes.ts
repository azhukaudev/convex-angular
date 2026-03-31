import { Route } from '@angular/router';
import { convexAuthGuard } from 'convex-angular';

export const AUTH_ROUTES: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('../pages/auth-login/auth-login'),
  },
  {
    path: 'success',
    canActivate: [convexAuthGuard],
    loadComponent: () => import('../pages/auth-success/auth-success'),
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
];
