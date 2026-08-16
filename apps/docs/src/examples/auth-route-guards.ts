import { ApplicationConfig } from '@angular/core';
import { Routes } from '@angular/router';
import {
  CONVEX_AUTH_GUARD_CONFIG,
  ConvexAuthGuardConfig,
  convexAuthGuard,
  convexUnauthGuard,
  createConvexAuthGuard,
  provideConvex,
  provideConvexAuthFromExisting,
} from 'convex-angular';

import { MyAuthService } from './auth-custom-provider';

// Claim-gated guard: `allow` runs only after the token has settled, so the
// claims are never read from a token the server already rejected.
const adminGuard = createConvexAuthGuard({
  allow: ({ claims }) => claims['role'] === 'admin',
  forbiddenRoute: '/forbidden',
});

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth-directives').then((m) => m.ShellComponent),
    // Signed-in users are bounced to `authenticatedRoute` (default '/').
    canActivate: [convexUnauthGuard],
  },
  {
    path: 'dashboard',
    // Prefer canMatch for lazy routes: a failed check stops the route from
    // matching at all, so the protected bundle is never downloaded.
    canMatch: [convexAuthGuard],
    loadComponent: () => import('./auth-directives').then((m) => m.ShellComponent),
  },
  {
    path: 'admin',
    canMatch: [adminGuard],
    loadComponent: () => import('./auth-directives').then((m) => m.ShellComponent),
  },
];

const guardConfig: ConvexAuthGuardConfig = {
  loginRoute: '/auth/signin',
  authenticatedRoute: '/dashboard',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://example-123.convex.cloud'),
    provideConvexAuthFromExisting(MyAuthService),
    { provide: CONVEX_AUTH_GUARD_CONFIG, useValue: guardConfig },
  ],
};
