import { ApplicationConfig } from '@angular/core';
import { ConvexSsrOptions, provideConvex } from 'convex-angular';

// Stand-in for your environment file or build-time define.
const environment = { convexUrl: 'https://your-deployment.convex.cloud' };

/**
 * One shared root configuration, parameterized by the SSR options.
 *
 * `provideConvex(...)` is root-only and may be registered exactly once, so the
 * server cannot add a second call on top of the browser config. Passing the
 * options in instead keeps a single registration: the browser entry point
 * calls `createAppConfig()` with no SSR options, and the server entry point
 * calls it with an `authToken` closed over the incoming request.
 */
export function createAppConfig(ssr: ConvexSsrOptions = {}): ApplicationConfig {
  return {
    providers: [
      // provideClientHydration() from '@angular/platform-browser' goes here too.
      provideConvex(environment.convexUrl, { ssr }),
    ],
  };
}

// Browser entry point: no server-side options.
export const appConfig = createAppConfig();
