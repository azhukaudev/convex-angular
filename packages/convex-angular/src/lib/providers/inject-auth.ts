import {
  DestroyRef,
  EnvironmentInjector,
  EnvironmentProviders,
  Type,
  assertInInjectionContext,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  runInInjectionContext,
  signal,
} from '@angular/core';

import {
  CONVEX_AUTH,
  CONVEX_AUTH_CONFIG,
  ConvexAuthConfig,
  ConvexAuthProvider,
  ConvexAuthState,
  ConvexAuthStatus,
} from '../tokens/auth';
import { injectConvex } from './inject-convex';

/**
 * WeakMap to store auth state per injector.
 * This allows multiple independent auth contexts in the same application
 * (e.g., for testing or multi-tenant scenarios).
 */
const authStateByInjector = new WeakMap<
  EnvironmentInjector,
  {
    isConvexAuthenticated: ReturnType<typeof signal<boolean | null>>;
    error: ReturnType<typeof signal<Error | undefined>>;
    initialized: boolean;
  }
>();

/**
 * Get or create auth state for the current injector.
 * This ensures we have a singleton auth state per injector context.
 */
function getOrCreateAuthState(injector: EnvironmentInjector) {
  let state = authStateByInjector.get(injector);
  if (!state) {
    state = {
      isConvexAuthenticated: signal<boolean | null>(null),
      error: signal<Error | undefined>(undefined),
      initialized: false,
    };
    authStateByInjector.set(injector, state);
  }
  return state;
}

/**
 * Initialize auth synchronization with the Convex client.
 * This is called once per injector when the first `injectAuth()` is called.
 */
function initializeAuthSync(
  injector: EnvironmentInjector,
  authConfig: ConvexAuthConfig,
  state: ReturnType<typeof getOrCreateAuthState>,
): void {
  if (state.initialized) {
    return;
  }
  state.initialized = true;

  runInInjectionContext(injector, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);

    // Track the current auth setup to handle cleanup
    let currentAuthCleanup: (() => void) | undefined;

    const clearAuthIfNeeded = () => {
      if (convex.client.hasAuth()) {
        convex.client.clearAuth();
      }
    };

    // Effect to sync auth state with Convex client
    effect(() => {
      const providerLoading = authConfig.isLoading();
      const providerAuthenticated = authConfig.isAuthenticated();

      // Cleanup previous auth setup if any
      currentAuthCleanup?.();
      currentAuthCleanup = undefined;

      // If provider is loading, reset Convex auth state to null (loading)
      if (providerLoading) {
        clearAuthIfNeeded();
        state.isConvexAuthenticated.set(null);
        state.error.set(undefined);
        return;
      }

      // If provider says not authenticated, reflect that immediately
      if (!providerAuthenticated) {
        clearAuthIfNeeded();
        state.isConvexAuthenticated.set(false);
        state.error.set(undefined);
        return;
      }

      // Provider is authenticated - set up Convex auth
      // Initially trust the provider's auth state
      state.isConvexAuthenticated.set(true);
      state.error.set(undefined);

      convex.setAuth(
        authConfig.fetchAccessToken,
        (backendReportsIsAuthenticated: boolean) => {
          // Backend can override if it disagrees
          state.isConvexAuthenticated.set(backendReportsIsAuthenticated);
          if (backendReportsIsAuthenticated) {
            state.error.set(undefined);
          }
        },
      );

      // Store cleanup function
      currentAuthCleanup = () => {
        clearAuthIfNeeded();
      };
    });

    // Cleanup on destroy
    destroyRef.onDestroy(() => {
      currentAuthCleanup?.();
      authStateByInjector.delete(injector);
    });
  });
}

/**
 * Inject the Convex authentication state.
 *
 * This provides reactive signals for the current authentication status.
 * Requires an auth integration to be configured via `provideConvexAuth()`
 * or a provider-specific function like `provideClerkAuth()`.
 *
 * @example
 * ```typescript
 * @Component({
 *   template: `
 *     @switch (auth.status()) {
 *       @case ('loading') { <p-progressSpinner /> }
 *       @case ('authenticated') { <app-dashboard /> }
 *       @case ('unauthenticated') { <app-login /> }
 *     }
 *   `,
 * })
 * export class AppComponent {
 *   readonly auth = injectAuth();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using individual signals
 * @Component({
 *   template: `
 *     @if (auth.isLoading()) {
 *       <span>Loading...</span>
 *     } @else if (auth.isAuthenticated()) {
 *       <span>Welcome!</span>
 *     } @else {
 *       <button (click)="login()">Sign In</button>
 *     }
 *
 *     @if (auth.error()) {
 *       <span class="error">{{ auth.error()?.message }}</span>
 *     }
 *   `,
 * })
 * export class NavComponent {
 *   readonly auth = injectAuth();
 * }
 * ```
 *
 * @returns ConvexAuthState with isLoading, isAuthenticated, error, and status signals
 * @throws Error if called without an auth provider configured
 *
 * @public
 */
export function injectAuth(): ConvexAuthState {
  assertInInjectionContext(injectAuth);

  const authConfig = inject(CONVEX_AUTH_CONFIG, { optional: true });

  if (!authConfig) {
    throw new Error(
      'Could not find `CONVEX_AUTH_CONFIG`. ' +
        'Make sure to call `provideConvexAuth()`, `provideClerkAuth()`, ' +
        'or `provideAuth0Auth()` in your application providers.',
    );
  }

  const injector = inject(EnvironmentInjector);
  const state = getOrCreateAuthState(injector);

  // Initialize auth sync on first call
  initializeAuthSync(injector, authConfig, state);

  // Computed signals based on auth config and Convex state
  const isLoading = computed(() => {
    // Loading if auth provider is loading OR Convex hasn't confirmed yet
    return authConfig.isLoading() || state.isConvexAuthenticated() === null;
  });

  const isAuthenticated = computed(() => {
    // Must be authenticated by provider AND confirmed by Convex
    return (
      authConfig.isAuthenticated() && (state.isConvexAuthenticated() ?? false)
    );
  });

  const status = computed<ConvexAuthStatus>(() => {
    if (isLoading()) return 'loading';
    if (isAuthenticated()) return 'authenticated';
    return 'unauthenticated';
  });

  return {
    isLoading,
    isAuthenticated,
    error: state.error.asReadonly(),
    status,
  };
}

/**
 * Provide a custom auth integration for Convex.
 *
 * Use this to integrate any auth provider with Convex. First, create a service
 * that implements `ConvexAuthProvider`, then provide it using the `CONVEX_AUTH`
 * token, and finally call `provideConvexAuth()`.
 *
 * If your auth provider is an injectable service that you also inject elsewhere
 * (for example to call `signIn()` or `signOut()`), register it with
 * `useExisting` to avoid creating two service instances.
 *
 * This pattern ensures your auth service is created within Angular's injection
 * context, avoiding race conditions that can occur when signals are created
 * outside of DI.
 *
 * @example
 * ```typescript
 * // 1. Create your auth service implementing ConvexAuthProvider
 * @Injectable({ providedIn: 'root' })
 * export class MyAuthService implements ConvexAuthProvider {
 *   readonly isLoading = signal(true);
 *   readonly isAuthenticated = signal(false);
 *
 *   constructor() {
 *     // Initialize your auth provider
 *     myAuthProvider.onStateChange((state) => {
 *       this.isLoading.set(false);
 *       this.isAuthenticated.set(state.loggedIn);
 *     });
 *   }
 *
 *   async fetchAccessToken({ forceRefreshToken }: { forceRefreshToken: boolean }) {
 *     return myAuthProvider.getToken({ refresh: forceRefreshToken });
 *   }
 * }
 *
 * // 2. Register in app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex(environment.convexUrl),
 *     { provide: CONVEX_AUTH, useExisting: MyAuthService },
 *     provideConvexAuth(),
 *   ],
 * };
 *
 * // 3. Use in components
 * export class AppComponent {
 *   readonly auth = injectAuth();
 * }
 * ```
 *
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideConvexAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH_CONFIG,
      useFactory: (): ConvexAuthConfig => {
        const provider = inject(CONVEX_AUTH);
        return {
          isLoading: provider.isLoading,
          isAuthenticated: provider.isAuthenticated,
          fetchAccessToken: (args) => provider.fetchAccessToken(args),
        };
      },
    },
    provideEnvironmentInitializer(() => {
      injectAuth();
    }),
  ]);
}

/**
 * Provide Convex auth using an existing injectable auth service instance.
 *
 * This registers `{ provide: CONVEX_AUTH, useExisting: authProviderType }` and
 * enables auth sync via `provideConvexAuth()`. Prefer this helper when the auth
 * provider is also injected elsewhere in your app (to avoid creating two
 * instances).
 *
 * @example
 * ```typescript
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideConvex(environment.convexUrl),
 *     provideConvexAuthFromExisting(MyAuthService),
 *   ],
 * };
 * ```
 *
 * @param authProviderType - Injectable service implementing ConvexAuthProvider
 * @returns EnvironmentProviders to add to your application providers
 *
 * @public
 */
export function provideConvexAuthFromExisting(
  authProviderType: Type<ConvexAuthProvider>,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CONVEX_AUTH, useExisting: authProviderType },
    provideConvexAuth(),
  ]);
}
