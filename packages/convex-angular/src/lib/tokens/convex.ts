import {
  DestroyRef,
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { ConvexClient, ConvexClientOptions } from 'convex/browser';

/**
 * Injection token for the ConvexClient instance.
 *
 * Use `injectConvex()` to access the client in components and services,
 * or inject this token directly when needed.
 *
 * @see {@link provideConvex} to configure the client
 * @see {@link injectConvex} to inject the client
 *
 * @public
 */
export const CONVEX = new InjectionToken<ConvexClient>('CONVEX');

/**
 * Factory function that creates and configures a ConvexClient instance.
 * Automatically registers cleanup on destroy.
 *
 * @param convexUrl - The URL of the Convex deployment
 * @param options - Optional ConvexClient configuration options
 * @returns A configured ConvexClient instance
 *
 * @internal
 */
function convexClientFactory(
  convexUrl: string,
  options?: ConvexClientOptions,
): ConvexClient {
  const destroyRef = inject(DestroyRef);
  const client = new ConvexClient(convexUrl, options);
  destroyRef.onDestroy(() => client.close());
  return client;
}

/**
 * Provide the ConvexClient for dependency injection.
 *
 * This must be called in your application's providers to enable
 * all Convex functionality including queries, mutations, and actions.
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * import { provideConvex } from 'convex-angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex('https://your-deployment.convex.cloud'),
 *   ],
 * };
 * ```
 *
 * @param convexUrl - The URL of your Convex deployment
 * @param options - Optional ConvexClient configuration options
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideConvex(
  convexUrl: string,
  options?: ConvexClientOptions,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX,
      useFactory: () => convexClientFactory(convexUrl, options),
    },
  ]);
}
