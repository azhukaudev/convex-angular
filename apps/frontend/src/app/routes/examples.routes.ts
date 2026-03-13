import { Route } from '@angular/router';
import { provideConvex } from 'convex-angular';

import { environment } from '../../environments/environment';

export const EXAMPLE_ROUTES: Route[] = [
  {
    path: '',
    providers: [provideConvex(environment.convexUrl)],
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
