import { Route } from '@angular/router';

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
    path: '**',
    redirectTo: '',
  },
];
