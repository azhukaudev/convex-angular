import { Signal, assertInInjectionContext, signal } from '@angular/core';
import { FunctionReference, FunctionReturnType } from 'convex/server';

import { injectConvex } from './inject-convex';

/**
 * A FunctionReference that refers to a Convex action.
 */
export type ActionReference = FunctionReference<'action'>;

/**
 * Options for injectAction.
 */
export interface ActionOptions<Action extends ActionReference> {
  /**
   * Callback invoked when the action completes successfully.
   * @param data - The return value of the action
   */
  onSuccess?: (data: FunctionReturnType<Action>) => void;

  /**
   * Callback invoked when the action fails.
   * @param err - The error that occurred
   */
  onError?: (err: Error) => void;
}

/**
 * The result of calling injectAction.
 */
export interface ActionResult<Action extends ActionReference> {
  /**
   * Execute the action with the given arguments.
   * @param args - The arguments to pass to the action
   * @returns A promise that resolves with the action's return value
   */
  run: (args: Action['_args']) => Promise<FunctionReturnType<Action>>;

  /**
   * The data returned by the last successful action call.
   * Undefined until the action completes successfully.
   */
  data: Signal<FunctionReturnType<Action>>;

  /**
   * The error from the last failed action call.
   * Undefined if the action hasn't failed.
   */
  error: Signal<Error | undefined>;

  /**
   * True while the action is running.
   */
  isLoading: Signal<boolean>;
}

/**
 * Create a reactive action caller.
 *
 * Actions are used for operations that have side effects beyond the database,
 * such as calling third-party APIs, sending emails, or other external operations.
 *
 * @example
 * ```typescript
 * const sendEmail = injectAction(api.emails.send, {
 *   onSuccess: (result) => console.log('Email sent!', result),
 *   onError: (err) => console.error('Failed to send email', err),
 * });
 *
 * // In template:
 * // <button (click)="sendEmail.run({ to: 'user@example.com', subject: 'Hello' })">
 * //   Send Email
 * // </button>
 * //
 * // @if (sendEmail.isLoading()) {
 * //   <span>Sending...</span>
 * // }
 * ```
 *
 * @param action - A FunctionReference to the action function
 * @param options - Optional callbacks for success and error handling
 * @returns An ActionResult with run method and reactive state signals
 */
export function injectAction<Action extends ActionReference>(
  action: Action,
  options?: ActionOptions<Action>,
): ActionResult<Action> {
  assertInInjectionContext(injectAction);
  const convex = injectConvex();

  // Internal signals for tracking state
  const data = signal<FunctionReturnType<Action>>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);

  /**
   * Reset all state before a new action call.
   */
  const reset = () => {
    data.set(undefined);
    error.set(undefined);
    isLoading.set(false);
  };

  /**
   * Execute the action with the given arguments.
   */
  const run = async (
    args: Action['_args'],
  ): Promise<FunctionReturnType<Action>> => {
    try {
      reset();
      isLoading.set(true);

      const result = await convex.action(action, args);
      data.set(result);
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      error.set(errorObj);
      options?.onError?.(errorObj);
      return undefined;
    } finally {
      isLoading.set(false);
    }
  };

  return {
    run,
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
  };
}
