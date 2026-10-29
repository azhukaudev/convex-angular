import { ErrorHandler, inject } from '@angular/core';

/**
 * Wrap a helper's optional `onSuccess`/`onError` so that a throwing consumer
 * callback cannot leak into the caller: the helper's own state transition, the
 * promise a mutation returns, or the Convex client's listener dispatch
 * (which would skip every later subscriber). The error goes to Angular's
 * ErrorHandler, where errors from event handlers and effects also land.
 * Absent callbacks become no-ops. Call in an injection context.
 *
 * @internal
 */
export function injectUserCallbacks<S extends unknown[], E extends unknown[]>(options?: {
  onSuccess?: (...args: S) => void;
  onError?: (...args: E) => void;
}): { onSuccess: (...args: S) => void; onError: (...args: E) => void } {
  const errorHandler = inject(ErrorHandler);
  // Reads the option at call time, so a callback the consumer reassigns later is honored.
  const guard = (run: () => void): void => {
    try {
      run();
    } catch (callbackError) {
      errorHandler.handleError(callbackError);
    }
  };
  return {
    onSuccess: (...args) => guard(() => options?.onSuccess?.(...args)),
    onError: (...args) => guard(() => options?.onError?.(...args)),
  };
}
