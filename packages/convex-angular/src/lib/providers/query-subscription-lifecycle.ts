import { DestroyRef } from '@angular/core';
import { Value } from 'convex/values';

import { SkipToken, skipToken } from '../skip-token';
import { serializeConvexArgsStable } from './serialize-convex-args-stable';

type Unsubscribe = () => void;

export interface SubscriptionTarget<T> {
  identity: string;
  value: T;
}

interface SubscriptionActivationControls {
  generation: number;
  isCurrent: () => boolean;
}

interface SubscriptionControllerOptions<T> {
  onSkip: () => void;
  onPending: (
    value: T,
    context: {
      hadPreviousSubscription: boolean;
      identity: string;
    },
  ) => void;
  subscribe: (value: T, controls: SubscriptionActivationControls) => Unsubscribe | void;
}

export interface SubscriptionController<T> {
  sync: (target: SubscriptionTarget<T> | SkipToken) => void;
  dispose: () => void;
}

export function serializeArgs(args: Record<string, Value>): string {
  return serializeConvexArgsStable(args);
}

export function createSubscriptionController<T>(
  destroyRef: DestroyRef,
  options: SubscriptionControllerOptions<T>,
): SubscriptionController<T> {
  let unsubscribe: Unsubscribe | undefined;
  let currentIdentity: string | undefined;
  let activeGeneration = 0;
  let hasActiveSubscription = false;

  const cleanupSubscription = () => {
    const currentUnsubscribe = unsubscribe;
    if (!currentUnsubscribe) {
      return;
    }

    unsubscribe = undefined;
    currentUnsubscribe();
  };

  const dispose = () => {
    if (!hasActiveSubscription && !unsubscribe && currentIdentity === undefined) {
      return;
    }

    activeGeneration += 1;
    currentIdentity = undefined;
    hasActiveSubscription = false;
    cleanupSubscription();
  };

  destroyRef.onDestroy(dispose);

  const sync = (target: SubscriptionTarget<T> | SkipToken) => {
    if (target === skipToken) {
      dispose();
      options.onSkip();
      return;
    }

    if (currentIdentity === target.identity) {
      return;
    }

    const hadPreviousSubscription = hasActiveSubscription;

    activeGeneration += 1;
    cleanupSubscription();
    currentIdentity = target.identity;
    hasActiveSubscription = true;

    options.onPending(target.value, {
      hadPreviousSubscription,
      identity: target.identity,
    });

    const generation = activeGeneration;
    unsubscribe =
      options.subscribe(target.value, {
        generation,
        isCurrent: () => generation === activeGeneration,
      }) ?? undefined;
  };

  return {
    sync,
    dispose,
  };
}
