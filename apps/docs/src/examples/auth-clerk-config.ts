import { ApplicationConfig } from '@angular/core';
import { CLERK_AUTH, provideClerkAuth, provideConvex } from 'convex-angular';

import { ClerkAuthService } from './auth-clerk';

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://example-123.convex.cloud'),
    // `useExisting` so Angular reuses the singleton instead of constructing a
    // second ClerkAuthService for the token.
    { provide: CLERK_AUTH, useExisting: ClerkAuthService },
    // Already includes provideConvexAuth(). Do not register that as well.
    provideClerkAuth(),
  ],
};
