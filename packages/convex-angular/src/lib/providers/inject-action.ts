import { Signal, assertInInjectionContext } from '@angular/core';
import { FunctionReference, FunctionReturnType } from 'convex/server';

import { ActionStatus } from '../types';
import { createCallableProvider } from './create-callable-provider';
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
   * @throws Error if the action fails (after updating error state and calling onError)
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

  /**
   * True when the action completed successfully.
   * False when idle, loading, or when there's an error.
   */
  isSuccess: Signal<boolean>;

  /**
   * The current status of the action.
   * - 'idle': Action has not been called yet or was reset
   * - 'pending': Action is in progress
   * - 'success': Action completed successfully
   * - 'error': Action failed with an error
   */
  status: Signal<ActionStatus>;

  /**
   * Reset the action state (data, error, isLoading).
   * Useful for resetting state after navigation or form reset.
   */
  reset: () => void;
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
 * // @switch (sendEmail.status()) {
 * //   @case ('pending') { <span>Sending...</span> }
 * //   @case ('success') { <span>Sent!</span> }
 * //   @case ('error') { <span>Error: {{ sendEmail.error()?.message }}</span> }
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

  const provider = createCallableProvider<FunctionReturnType<Action>>({
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });

  /**
   * Execute the action with the given arguments.
   */
  const run = (args: Action['_args']): Promise<FunctionReturnType<Action>> => {
    return provider.execute(() => convex.action(action, args));
  };

  return {
    run,
    data: provider.data,
    error: provider.error,
    isLoading: provider.isLoading,
    isSuccess: provider.isSuccess,
    status: provider.status as Signal<ActionStatus>,
    reset: provider.reset,
  };
}
