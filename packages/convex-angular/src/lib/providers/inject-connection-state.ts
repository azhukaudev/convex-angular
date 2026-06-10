import { DestroyRef, EnvironmentInjector, Signal, inject, signal } from '@angular/core';
import { ConnectionState } from 'convex/browser';

import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

export interface InjectConvexConnectionStateOptions {
  /**
   * Environment injector used to create the connection state helper outside
   * the current injection context.
   */
  injectRef?: EnvironmentInjector;
}

/**
 * Inject the current Convex connection state and subscribe to updates.
 *
 * This is useful for showing reconnecting indicators, surfacing connectivity
 * diagnostics, or building offline-aware UI.
 *
 * @example
 * ```typescript
 * const connectionState = injectConvexConnectionState();
 *
 * if (!connectionState().isWebSocketConnected) {
 *   console.log('Reconnecting to Convex...');
 * }
 * ```
 *
 * @returns A readonly signal with the latest connection state
 */
export function injectConvexConnectionState(options?: InjectConvexConnectionStateOptions): Signal<ConnectionState> {
  return runInResolvedInjectionContext(injectConvexConnectionState, options?.injectRef, () => {
    const convex = injectConvex();
    const destroyRef = inject(DestroyRef);

    // A disabled client (server-side rendering) has no connection and its
    // connection-state accessors throw; report a static disconnected state.
    if (convex.disabled) {
      return signal<ConnectionState>({
        hasInflightRequests: false,
        isWebSocketConnected: false,
        timeOfOldestInflightRequest: null,
        hasEverConnected: false,
        connectionCount: 0,
        connectionRetries: 0,
        inflightMutations: 0,
        inflightActions: 0,
      }).asReadonly();
    }

    const connectionState = signal<ConnectionState>(convex.connectionState());
    const unsubscribe = convex.subscribeToConnectionState((nextState) => {
      connectionState.set(nextState);
    });

    destroyRef.onDestroy(() => unsubscribe());

    return connectionState.asReadonly();
  });
}
