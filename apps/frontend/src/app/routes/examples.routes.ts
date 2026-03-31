import { Route } from '@angular/router';

export const EXAMPLE_ROUTES: Route[] = [
  {
    path: '',
    children: [
      {
        path: 'basic',
        loadComponent: () => import('../pages/todo-list/todo-list'),
      },
      {
        path: 'paginated',
        loadComponent: () => import('../pages/paginated-todo-list/paginated-todo-list'),
      },
      {
        path: 'multi-query',
        loadComponent: () => import('../pages/multi-query-demo/multi-query-demo'),
      },
      {
        path: 'connection-state',
        loadComponent: () => import('../pages/connection-state-demo/connection-state-demo'),
      },
      {
        path: 'prewarm-query',
        loadComponent: () => import('../pages/prewarm-query-demo/prewarm-query-demo'),
      },
      {
        path: 'paginated-optimistic',
        loadComponent: () => import('../pages/paginated-optimistic-demo/paginated-optimistic-demo'),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'basic',
      },
    ],
  },
];
