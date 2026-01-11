import { Route } from '@angular/router';
import { convexAuthGuard } from 'convex-angular';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing'),
  },
  {
    path: 'examples/basic',
    loadComponent: () => import('./pages/todo-list/todo-list'),
  },
  {
    path: 'examples/paginated',
    loadComponent: () =>
      import('./pages/paginated-todo-list/paginated-todo-list'),
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth-login/auth-login'),
  },
  {
    path: 'auth/success',
    loadComponent: () => import('./pages/auth-success/auth-success'),
    canActivate: [convexAuthGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
