import { DestroyRef, Signal, inject } from '@angular/core';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { ActionStatus } from '../types';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';
import {
  OptionalArgsTuple,
  assertNotAccidentalArgument,
  createInvocationSignals,
  createInvocationState,
  resetInvocationState,
  runInvocation,
} from './invocation-state';

/**
 * A FunctionReference that refers to a Convex action.
 */
export type ActionReference = FunctionReference<'action'>;

/**
 * Options for injectAction.
 */
export interface ActionOptions<Action extends ActionReference> {
  /**
   * Environment injector used to resolve dependencies when creating the action
   * outside the current injection context.
   */
  injectRef?: import('@angular/core').EnvironmentInjector;

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
 * A callable action helper returned by injectAction.
 *
 * Call it directly to execute the action:
 * ```typescript
 * await sendEmail({ to: 'user@example.com', subject: 'Hello' });
 * ```
 */
export interface AngularAction<Action extends ActionReference> {
  (...args: OptionalArgsTuple<Action>): Promise<FunctionReturnType<Action>>;

  /**
   * The data returned by the last successful action call.
   * Undefined until the action completes successfully.
   */
  data: Signal<FunctionReturnType<Action> | undefined>;

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

function createActionHelper<Action extends ActionReference>(
  action: Action,
  convex: ReturnType<typeof injectConvex>,
  destroyRef: DestroyRef,
  options: ActionOptions<Action> | undefined,
): AngularAction<Action> {
  const state = createInvocationState<FunctionReturnType<Action>>();
  const { isSuccess, status } = createInvocationSignals<ActionStatus>(state);

  const reset = () => resetInvocationState(state);

  destroyRef.onDestroy(() => {
    state.isDestroyed = true;
    reset();
  });

  const call = async (...args: OptionalArgsTuple<Action>): Promise<FunctionReturnType<Action>> => {
    const parsedArgs = (args[0] ?? {}) as FunctionArgs<Action>;
    assertNotAccidentalArgument(parsedArgs, 'myAction');

    if (state.isDestroyed) {
      return convex.action(action, parsedArgs);
    }

    return runInvocation(state, options, () => convex.action(action, parsedArgs));
  };

  return Object.assign(call, {
    data: state.data.asReadonly(),
    error: state.error.asReadonly(),
    isLoading: state.isLoading.asReadonly(),
    isSuccess,
    status,
    reset,
  }) as AngularAction<Action>;
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
 * // Call directly:
 * await sendEmail({ to: 'user@example.com', subject: 'Hello' });
 *
 * // In template:
 * // @switch (sendEmail.status()) {
 * //   @case ('pending') { <span>Sending...</span> }
 * //   @case ('success') { <span>Sent!</span> }
 * //   @case ('error') { <span>Error: {{ sendEmail.error()?.message }}</span> }
 * // }
 * ```
 *
 * @param action - A FunctionReference to the action function
 * @param options - Optional callbacks for success and error handling
 * @returns An AngularAction callable helper with reactive state signals.
 */
export function injectAction<Action extends ActionReference>(
  action: Action,
  options?: ActionOptions<Action>,
): AngularAction<Action> {
  const { convex, destroyRef } = runInResolvedInjectionContext(injectAction, options?.injectRef, () => ({
    convex: injectConvex(),
    destroyRef: inject(DestroyRef),
  }));

  return createActionHelper(action, convex, destroyRef, options);
}
