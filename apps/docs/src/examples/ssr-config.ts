import { ApplicationConfig } from '@angular/core';
import { provideConvex } from 'convex-angular';

// Stand-in for your environment file or build-time define.
const environment = { convexUrl: 'https://your-deployment.convex.cloud' };

// Stand-in for reading the JWT off the incoming request. It must not call
// inject() — see the Authenticated SSR page.
declare function readTokenForCurrentRequest(): string | null;

export const appConfig: ApplicationConfig = {
  providers: [
    // provideClientHydration() from '@angular/platform-browser' belongs here
    // as well — it is what makes the browser reuse the server-rendered DOM.
    provideConvex(environment.convexUrl, {
      ssr: {
        // Fetch queries over HTTP during the server render (default: true).
        fetchOnServer: true,
        // Resolved at most once per server render, then memoized.
        authToken: () => readTokenForCurrentRequest(),
        // Embed authenticated results in the HTML (default: true). Requires
        // `Cache-Control: private` or `no-store` on the response.
        transferAuthenticatedResults: true,
      },
    }),
  ],
};
