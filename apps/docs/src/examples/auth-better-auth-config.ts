import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';
import { BetterAuthClientLike, provideBetterAuth } from 'convex-angular/better-auth';

// import { authClient } from './auth-client';
//
// These docs do not depend on `better-auth`, so the shared client instance is
// declared here. A client built with
// `createAuthClient({ plugins: [convexClient(), crossDomainClient()] })`
// structurally satisfies `BetterAuthClientLike`.
declare const authClient: BetterAuthClientLike;

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://example-123.convex.cloud'),
    // The factory is invoked lazily and only in the browser — it never runs
    // during server-side rendering. Already includes provideConvexAuth().
    provideBetterAuth(() => authClient),
  ],
};
