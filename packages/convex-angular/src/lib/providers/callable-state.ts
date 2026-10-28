import { DestroyRef, ErrorHandler, Signal, computed, signal, untracked } from '@angular/core';

import { MutationStatus } from '../types';
import { runUserCallback } from './user-callback';

/**
 * Status of an imperative Convex call. MutationStatus and ActionStatus are
 * the same union; the canonical definition lives in types.ts.
 *
 * @internal
 */
type CallableStatus = MutationStatus;

/**
 * Callbacks shared by injectMutation and injectAction.
 *
 * @internal
 */
interface CallableStateOptions<TResult> {
  onSuccess?: (data: TResult) => void;
  onError?: (err: Error) => void;
}

/**
 * Reactive state shared by injectMutation and injectAction.
 *
 * @internal
 */
export interface CallableState<TArgs, TResult> {
  execute: (args: TArgs) => Promise<TResult>;
  data: Signal<TResult | undefined>;
  error: Signal<Error | undefined>;
  isLoading: Signal<boolean>;
  isSuccess: Signal<boolean>;
  status: Signal<CallableStatus>;
  reset: () => void;
}

/**
 * Shared core for imperative Convex callers (mutations and actions): status
 * signals, a version counter so only the latest invocation updates state,
 * reset, and destroy handling. After the owning scope is destroyed the
 * returned promise still settles, but reactive state stops updating and
 * callbacks stop firing. An exception thrown by `onSuccess`/`onError` is
 * reported to the `ErrorHandler`; it never changes the state or the promise
 * outcome.
 *
 * @internal
 */
export function createCallableState<TArgs, TResult>(
  destroyRef: DestroyRef,
  errorHandler: ErrorHandler,
  invoke: (args: TArgs) => Promise<TResult>,
  options?: CallableStateOptions<TResult>,
): CallableState<TArgs, TResult> {
  // Internal signals for tracking state
  const data = signal<TResult | undefined>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);
  const currentVersion = signal(0);
  let isDestroyed = false;

  // Track if the callable has been called (to distinguish idle from success)
  // Written on every settling path, success and failure alike, to keep the model
  // symmetric — even where the current `status`/`isSuccess` derivation masks it.
  const hasCompleted = signal(false);

  // Computed signals
  const isSuccess = computed(() => hasCompleted() && !isLoading() && !error());
  const status = computed<CallableStatus>(() => {
    if (isLoading()) return 'pending';
    if (error()) return 'error';
    if (hasCompleted()) return 'success';
    return 'idle';
  });

  const reset = () => {
    currentVersion.update((version) => version + 1);
    data.set(undefined);
    error.set(undefined);
    isLoading.set(false);
    hasCompleted.set(false);
  };

  destroyRef.onDestroy(() => {
    isDestroyed = true;
    reset();
  });

  const execute = async (args: TArgs): Promise<TResult> => {
    if (isDestroyed) {
      return invoke(args);
    }

    // untracked: mutate()/run() must not register this signal as a dependency of a calling effect.
    const callVersion = untracked(currentVersion) + 1;
    currentVersion.set(callVersion);

    try {
      // Reset state for the latest invocation.
      data.set(undefined);
      error.set(undefined);
      // Stryker disable next-line BooleanLiteral: masked by the isLoading.set(true) below.
      hasCompleted.set(false);
      isLoading.set(true);

      const result = await invoke(args);
      if (untracked(currentVersion) === callVersion) {
        data.set(result);
        hasCompleted.set(true);
        runUserCallback(errorHandler, () => options?.onSuccess?.(result));
      }
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (untracked(currentVersion) === callVersion) {
        error.set(errorObj);
        // Stryker disable next-line BooleanLiteral: masked by error() in the current derivation.
        hasCompleted.set(true);
        runUserCallback(errorHandler, () => options?.onError?.(errorObj));
      }
      throw errorObj;
    } finally {
      if (untracked(currentVersion) === callVersion) {
        isLoading.set(false);
      }
    }
  };

  return {
    execute,
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
    isSuccess,
    status,
    reset,
  };
}
