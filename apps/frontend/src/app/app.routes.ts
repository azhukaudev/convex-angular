import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing'),
  },
  {
    path: 'examples',
    loadChildren: () => import('./routes/examples.routes').then((module) => module.EXAMPLE_ROUTES),
  },
  {
    path: 'auth',
    loadChildren: () => import('./routes/auth.routes').then((module) => module.AUTH_ROUTES),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
