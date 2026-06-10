import { isPlatformServer } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  InjectionToken,
  PLATFORM_ID,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { ConvexClient, ConvexClientOptions, ConvexHttpClient } from 'convex/browser';

import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { ConvexHydrationState } from '../ssr/state-transfer';
import { CONVEX_HTTP_CLIENT, CONVEX_SSR_CONFIG, ConvexSsrOptions } from '../ssr/tokens';

/**
 * Options for {@link provideConvex}: all ConvexClient options plus
 * Angular-specific server-side rendering configuration.
 *
 * @public
 */
export interface ProvideConvexOptions extends ConvexClientOptions {
  /**
   * Server-side rendering options. See {@link ConvexSsrOptions}.
   */
  ssr?: ConvexSsrOptions;
}

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
  options?: ProvideConvexOptions,
): ConvexClient {
  const destroyRef = inject(DestroyRef);
  const isServer = isPlatformServer(inject(PLATFORM_ID));
  // The `ssr` key is Angular-specific and must not reach the ConvexClient
  // constructor. On the server the client is disabled: no WebSocket is
  // opened and subscriptions are no-ops; data is fetched over HTTP by the
  // ConvexServerQueryLoader instead.
  const { ssr: _ssr, ...clientOptions } = options ?? {};
  const client = new ConvexClient(convexUrl, isServer ? { ...clientOptions, disabled: true } : clientOptions);
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
  options?: ProvideConvexOptions,
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
    // SSR/hydration support: configuration, the HTTP client used for
    // server-side fetches, the server query loader, and the browser-side
    // hydration state reader. All are inert until injected.
    { provide: CONVEX_SSR_CONFIG, useValue: { url: convexUrl, ssr: options?.ssr ?? {} } },
    { provide: CONVEX_HTTP_CLIENT, useFactory: () => new ConvexHttpClient(convexUrl) },
    ConvexServerQueryLoader,
    ConvexHydrationState,
    // Eagerly run the guard during injector initialization for earlier, clearer
    // feedback when provideConvex(...) is misconfigured.
    provideEnvironmentInitializer(() => {
      inject(CONVEX_PROVIDER_GUARD);
    }),
  ]);
}
