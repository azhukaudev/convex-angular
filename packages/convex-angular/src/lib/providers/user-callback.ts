import { ErrorHandler } from '@angular/core';

/**
 * Run a consumer-supplied callback (`onSuccess`/`onError`) so that a throw
 * cannot leak into the caller: the helper's own state transition, the
 * promise a mutation returns, or the Convex client's listener dispatch
 * (which would skip every later subscriber). The error goes to Angular's
 * ErrorHandler, where errors from event handlers and effects also land.
 *
 * @internal
 */
export function runUserCallback(errorHandler: ErrorHandler, callback: () => void): void {
  try {
    callback();
  } catch (callbackError) {
    errorHandler.handleError(callbackError);
  }
}
