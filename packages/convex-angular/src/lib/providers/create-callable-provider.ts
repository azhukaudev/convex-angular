import { Signal, computed, signal } from '@angular/core';

import { CallableStatus } from '../types';

/**
 * Options for creating a callable provider.
 * @internal
 */
export interface CallableProviderOptions<TData> {
  /**
   * Callback invoked when the operation completes successfully.
   */
  onSuccess?: (data: TData) => void;

  /**
   * Callback invoked when the operation fails.
   */
  onError?: (err: Error) => void;
}

/**
 * The shared state returned by createCallableProvider.
 * @internal
 */
export interface CallableProviderState<TData> {
  /**
   * The data returned by the last successful call.
   * Undefined when idle, loading, or after reset.
   */
  data: Signal<TData | undefined>;

  /**
   * The error from the last failed call.
   */
  error: Signal<Error | undefined>;

  /**
   * True while the operation is running.
   */
  isLoading: Signal<boolean>;

  /**
   * True when the operation completed successfully.
   */
  isSuccess: Signal<boolean>;

  /**
   * True when the operation failed with an error.
   */
  isError: Signal<boolean>;

  /**
   * The current status of the operation.
   */
  status: Signal<CallableStatus>;

  /**
   * Reset all state to initial values.
   */
  reset: () => void;

  /**
   * Execute an async operation with shared state management.
   * Sets loading/error/success signals and calls callbacks.
   * Re-throws errors after setting state so callers can handle them.
   */
  execute: (fn: () => Promise<TData>) => Promise<TData>;
}

/**
 * Create shared state and execution logic for callable providers
 * (mutations and actions).
 *
 * This eliminates code duplication between `injectMutation` and `injectAction`,
 * which share identical signal management, computed derivations, reset logic,
 * and try/catch/finally patterns.
 *
 * @param options - Optional callbacks for success and error handling
 * @returns Shared state signals and an execute function
 *
 * @internal
 */
export function createCallableProvider<TData>(
  options?: CallableProviderOptions<TData>,
): CallableProviderState<TData> {
  // Internal signals for tracking state
  const data = signal<TData | undefined>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);

  // Track if operation has been called (to distinguish idle from success)
  const hasCompleted = signal(false);

  // Computed signals
  const isSuccess = computed(() => hasCompleted() && !isLoading() && !error());
  const isError = computed(() => error() !== undefined);
  const status = computed<CallableStatus>(() => {
    if (isLoading()) return 'pending';
    if (error()) return 'error';
    if (hasCompleted()) return 'success';
    return 'idle';
  });

  /**
   * Reset all state to initial values.
   */
  const reset = () => {
    data.set(undefined);
    error.set(undefined);
    isLoading.set(false);
    hasCompleted.set(false);
  };

  /**
   * Execute an async operation with shared state management.
   * Re-throws errors after updating state and calling onError.
   */
  const execute = async (fn: () => Promise<TData>): Promise<TData> => {
    try {
      // Reset state before new operation
      data.set(undefined);
      error.set(undefined);
      hasCompleted.set(false);
      isLoading.set(true);

      const result = await fn();
      data.set(result);
      hasCompleted.set(true);
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      error.set(errorObj);
      hasCompleted.set(true);
      options?.onError?.(errorObj);
      throw errorObj;
    } finally {
      isLoading.set(false);
    }
  };

  return {
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
    isSuccess,
    isError,
    status,
    reset,
    execute,
  };
}
