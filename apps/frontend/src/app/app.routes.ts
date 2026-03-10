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
    loadComponent: () => import('./pages/paginated-todo-list/paginated-todo-list'),
  },
  {
    path: 'examples/multi-query',
    loadComponent: () => import('./pages/multi-query-demo/multi-query-demo'),
  },
  {
    path: 'examples/connection-state',
    loadComponent: () => import('./pages/connection-state-demo/connection-state-demo'),
  },
  {
    path: 'examples/prewarm-query',
    loadComponent: () => import('./pages/prewarm-query-demo/prewarm-query-demo'),
  },
  {
    path: 'examples/paginated-optimistic',
    loadComponent: () => import('./pages/paginated-optimistic-demo/paginated-optimistic-demo'),
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
