import {
  DestroyRef,
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
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

// Internal multi-token used as a per-injector registration marker for
// provideConvex(...). The number of values in the current injector tells us
// how many times provideConvex(...) was registered in that scope.
const CONVEX_PROVIDER_REGISTRATION = new InjectionToken<boolean[]>(
  'CONVEX_PROVIDER_REGISTRATION',
);

// Internal token whose factory performs provider placement validation.
const CONVEX_PROVIDER_GUARD = new InjectionToken<true>('CONVEX_PROVIDER_GUARD');

function assertConvexProviderConfiguration() {
  // 1) Guard against duplicate provideConvex(...) calls in the same injector.
  const currentScopeRegistrations = inject(CONVEX_PROVIDER_REGISTRATION);

  if (currentScopeRegistrations.length > 1) {
    throw new Error(
      '`provideConvex(...)` was registered more than once in the same injector. ' +
        'Register it exactly once in your root application providers (for example, in `app.config.ts`).',
    );
  }

  const parentScopeRegistrations = inject(CONVEX_PROVIDER_REGISTRATION, {
    optional: true,
    skipSelf: true,
  });

  // 2) Guard against nested/child registrations when parent already configured
  // Convex. This keeps provideConvex(...) root-only.
  if (parentScopeRegistrations && parentScopeRegistrations.length > 0) {
    throw new Error(
      '`provideConvex(...)` must be configured only in your root application providers ' +
        '(for example, in `app.config.ts`). Remove nested or route-level registrations.',
    );
  }
}

function convexProviderGuardFactory(): true {
  assertConvexProviderConfiguration();
  return true;
}

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
 * This must be called once in your application's root providers (for example,
 * in `app.config.ts`) to enable
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
 * @returns Environment providers to add to your root application providers
 *
 * @public
 */
export function provideConvex(
  convexUrl: string,
  options?: ConvexClientOptions,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    // Registration marker for the current injector scope (multi so we can
    // detect accidental duplicates in the same providers array).
    { provide: CONVEX_PROVIDER_REGISTRATION, useValue: true, multi: true },
    // Guard provider executes shared validation logic.
    {
      provide: CONVEX_PROVIDER_GUARD,
      useFactory: convexProviderGuardFactory,
    },
    // Convex client provider depends on the guard to ensure invalid setups
    // fail before creating a client instance.
    {
      provide: CONVEX,
      useFactory: () => {
        inject(CONVEX_PROVIDER_GUARD);
        return convexClientFactory(convexUrl, options);
      },
    },
    // Eagerly run the guard during injector initialization for earlier, clearer
    // feedback when provideConvex(...) is misconfigured.
    provideEnvironmentInitializer(() => {
      inject(CONVEX_PROVIDER_GUARD);
    }),
  ]);
}
