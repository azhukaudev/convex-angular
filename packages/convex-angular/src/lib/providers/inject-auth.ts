import {
  DestroyRef,
  EnvironmentInjector,
  EnvironmentProviders,
  InjectionToken,
  Type,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { ConvexClient } from 'convex/browser';

import { CONVEX_AUTH, ConvexAuthProvider, ConvexAuthState, ConvexAuthStatus } from '../tokens/auth';
import { CONVEX } from '../tokens/convex';
import { runInResolvedInjectionContext } from './injection-context';

export interface InjectAuthOptions {
  /**
   * Environment injector used to create the auth helper outside the current
   * injection context.
   */
  injectRef?: EnvironmentInjector;
}

interface SequencedError {
  error: Error;
  sequence: number;
}

const CONVEX_AUTH_STATE = new InjectionToken<ConvexAuthState>('CONVEX_AUTH_STATE');
const CONVEX_AUTH_PROVIDER_REGISTRATION = new InjectionToken<boolean[]>('CONVEX_AUTH_PROVIDER_REGISTRATION');
const CONVEX_AUTH_PROVIDER_GUARD = new InjectionToken<true>('CONVEX_AUTH_PROVIDER_GUARD');

function assertConvexAuthProviderConfiguration() {
  const currentScopeRegistrations = inject(CONVEX_AUTH_PROVIDER_REGISTRATION);

  if (currentScopeRegistrations.length > 1) {
    throw new Error(
      '`provideConvexAuth()` was registered more than once in the same injector. ' +
        'Register it exactly once in your root application providers (for example, in `app.config.ts`).',
    );
  }

  const parentScopeRegistrations = inject(CONVEX_AUTH_PROVIDER_REGISTRATION, {
    optional: true,
    skipSelf: true,
  });

  if (parentScopeRegistrations && parentScopeRegistrations.length > 0) {
    throw new Error(
      '`provideConvexAuth()` must be configured only in your root application providers ' +
        '(for example, in `app.config.ts`). Remove nested or route-level registrations.',
    );
  }
}

function convexAuthProviderGuardFactory(): true {
  assertConvexAuthProviderConfiguration();
  return true;
}

function normalizeError(error: unknown, prefix: string): Error {
  if (error instanceof Error) {
    return new Error(`${prefix}: ${error.message}`);
  }

  return new Error(`${prefix}: ${String(error)}`);
}

function createConvexAuthState(): ConvexAuthState {
  const provider = inject(CONVEX_AUTH, { optional: true });
  if (!provider) {
    throw new Error(
      'Could not find `CONVEX_AUTH`. Make sure to provide an auth provider using `CONVEX_AUTH`, `provideClerkAuth()`, or `provideAuth0Auth()` before calling `provideConvexAuth()`.',
    );
  }

  const convex = inject(CONVEX, { optional: true }) as ConvexClient | null;
  if (!convex) {
    throw new Error(
      'Could not find `CONVEX`. Make sure to call `provideConvex(...)` once in your root application providers before calling `provideConvexAuth()`.',
    );
  }

  const destroyRef = inject(DestroyRef);

  const backendAuthenticated = signal<boolean | null>(null);
  const providerError = signal<SequencedError | undefined>(undefined);
  const internalError = signal<SequencedError | undefined>(undefined);

  let currentSequence = 0;
  let currentGeneration = 0;

  const nextSequence = () => {
    currentSequence += 1;
    return currentSequence;
  };

  const setProviderError = (error: Error) => {
    providerError.set({
      error,
      sequence: nextSequence(),
    });
  };

  const setInternalError = (error: unknown, prefix: string) => {
    internalError.set({
      error: normalizeError(error, prefix),
      sequence: nextSequence(),
    });
  };

  const clearInternalError = () => {
    internalError.set(undefined);
  };

  const clearAuthIfNeeded = () => {
    try {
      if (convex.client.hasAuth()) {
        convex.client.clearAuth();
      }
    } catch (error) {
      setInternalError(error, '[convex-angular auth] Convex auth sync failed');
      backendAuthenticated.set(false);
    }
  };

  const runForCurrentGeneration = (generation: number, work: () => void) => {
    void Promise.resolve().then(() => {
      if (generation !== currentGeneration) {
        return;
      }

      work();
    });
  };

  const isLoading = computed(() => {
    return provider.isLoading() || (provider.isAuthenticated() && backendAuthenticated() === null);
  });

  const isAuthenticated = computed(() => {
    return provider.isAuthenticated() && backendAuthenticated() === true;
  });

  const status = computed<ConvexAuthStatus>(() => {
    if (isLoading()) {
      return 'loading';
    }

    if (isAuthenticated()) {
      return 'authenticated';
    }

    return 'unauthenticated';
  });

  const error = computed(() => {
    const currentProviderError = providerError();
    const currentInternalError = internalError();

    if (!currentProviderError) {
      return currentInternalError?.error;
    }

    if (!currentInternalError) {
      return currentProviderError.error;
    }

    return currentProviderError.sequence >= currentInternalError.sequence
      ? currentProviderError.error
      : currentInternalError.error;
  });

  effect(() => {
    const upstreamError = provider.error?.();
    if (upstreamError) {
      setProviderError(upstreamError);
      return;
    }

    providerError.set(undefined);
  });

  effect(() => {
    const upstreamLoading = provider.isLoading();
    const upstreamAuthenticated = provider.isAuthenticated();
    provider.reauthVersion?.();

    currentGeneration += 1;
    const generation = currentGeneration;

    if (upstreamLoading) {
      clearInternalError();
      backendAuthenticated.set(null);
      runForCurrentGeneration(generation, () => {
        clearAuthIfNeeded();
      });
      return;
    }

    if (!upstreamAuthenticated) {
      clearInternalError();
      backendAuthenticated.set(false);
      runForCurrentGeneration(generation, () => {
        clearAuthIfNeeded();
      });
      return;
    }

    clearInternalError();
    backendAuthenticated.set(null);
    runForCurrentGeneration(generation, () => {
      clearAuthIfNeeded();

      try {
        convex.setAuth(
          async (args) => {
            try {
              const token = await provider.fetchAccessToken(args);

              if (generation !== currentGeneration) {
                return null;
              }

              if (token == null) {
                backendAuthenticated.set(false);
                return null;
              }

              return token;
            } catch (fetchError) {
              if (generation === currentGeneration) {
                setInternalError(fetchError, '[convex-angular auth] Token fetch failed');
                backendAuthenticated.set(false);
              }

              return null;
            }
          },
          (isConvexAuthenticated) => {
            if (generation !== currentGeneration) {
              return;
            }

            backendAuthenticated.set(isConvexAuthenticated);
            if (isConvexAuthenticated) {
              clearInternalError();
            }
          },
        );
      } catch (syncError) {
        if (generation === currentGeneration) {
          setInternalError(syncError, '[convex-angular auth] Convex auth sync failed');
          backendAuthenticated.set(false);
        }
      }
    });
  });

  destroyRef.onDestroy(() => {
    currentGeneration += 1;
    const generation = currentGeneration;
    runForCurrentGeneration(generation, () => {
      clearAuthIfNeeded();
    });
  });

  return {
    isLoading,
    isAuthenticated,
    error,
    status,
  };
}

/**
 * Inject the Convex authentication state.
 *
 * This provides reactive signals for the current authentication status.
 * Requires an auth integration to be configured via `provideConvexAuth()`
 * or a provider-specific function like `provideClerkAuth()`.
 *
 * @public
 */
export function injectAuth(options?: InjectAuthOptions): ConvexAuthState {
  return runInResolvedInjectionContext(injectAuth, options?.injectRef, () => {
    const state = inject(CONVEX_AUTH_STATE, { optional: true });

    if (!state) {
      throw new Error(
        'Could not find Convex auth state. Make sure to call `provideConvexAuth()`, `provideClerkAuth()`, or `provideAuth0Auth()` in your application providers.',
      );
    }

    return state;
  });
}

/**
 * Provide a custom auth integration for Convex.
 *
 * Use this to integrate any auth provider with Convex. First, create a service
 * that implements `ConvexAuthProvider`, then provide it using the `CONVEX_AUTH`
 * token, and finally call `provideConvexAuth()` exactly once in your root
 * application providers.
 *
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideConvexAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH_PROVIDER_REGISTRATION,
      useValue: true,
      multi: true,
    },
    {
      provide: CONVEX_AUTH_PROVIDER_GUARD,
      useFactory: convexAuthProviderGuardFactory,
    },
    {
      provide: CONVEX_AUTH_STATE,
      useFactory: () => {
        inject(CONVEX_AUTH_PROVIDER_GUARD);
        return createConvexAuthState();
      },
    },
    provideEnvironmentInitializer(() => {
      inject(CONVEX_AUTH_PROVIDER_GUARD);
      inject(CONVEX_AUTH_STATE);
    }),
  ]);
}

/**
 * Provide Convex auth using an existing injectable auth service instance.
 *
 * This registers `{ provide: CONVEX_AUTH, useExisting: authProviderType }` and
 * enables auth sync via `provideConvexAuth()`. Prefer this helper when the auth
 * provider is also injected elsewhere in your app. Register it exactly once in
 * your root application providers.
 *
 * @param authProviderType - Injectable service implementing ConvexAuthProvider
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideConvexAuthFromExisting(authProviderType: Type<ConvexAuthProvider>): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CONVEX_AUTH, useExisting: authProviderType }, provideConvexAuth()]);
}
