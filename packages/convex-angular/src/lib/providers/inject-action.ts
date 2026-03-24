import { DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';

import { ActionStatus } from '../types';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

/**
 * A FunctionReference that refers to a Convex action.
 */
export type ActionReference = FunctionReference<'action'>;

type EmptyArgs = Record<string, never>;

type OptionalArgsTuple<FuncRef extends FunctionReference<any>> =
  FunctionArgs<FuncRef> extends EmptyArgs
    ? [args?: EmptyArgs]
    : [args: FunctionArgs<FuncRef>];

function assertNotAccidentalArgument(value: unknown): void {
  if (typeof Event !== 'undefined' && value instanceof Event) {
    throw new Error(
      'Convex function called with an Event object. Did you pass the helper directly as an event handler? Wrap it like `() => myAction()` instead.',
    );
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'bubbles' in value &&
    'persist' in value &&
    'isDefaultPrevented' in value
  ) {
    throw new Error(
      'Convex function called with a SyntheticEvent object. Wrap the helper like `() => myAction()` instead of using it directly as an event handler.',
    );
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'preventDefault' in value &&
    'stopPropagation' in value &&
    'target' in value &&
    'type' in value
  ) {
    throw new Error(
      'Convex function called with an event-like object. Wrap the helper like `() => myAction()` instead of using it directly as an event handler.',
    );
  }
}

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

interface ActionState<Action extends ActionReference> {
  data: WritableSignal<FunctionReturnType<Action> | undefined>;
  error: WritableSignal<Error | undefined>;
  isLoading: WritableSignal<boolean>;
  hasCompleted: WritableSignal<boolean>;
  currentVersion: WritableSignal<number>;
  isDestroyed: boolean;
  onSuccess?: (data: FunctionReturnType<Action>) => void;
  onError?: (err: Error) => void;
}

function createActionState<Action extends ActionReference>(
  options?: ActionOptions<Action>,
): ActionState<Action> {
  return {
    data: signal<FunctionReturnType<Action> | undefined>(undefined),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    hasCompleted: signal(false),
    currentVersion: signal(0),
    isDestroyed: false,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  };
}

function createActionHelper<Action extends ActionReference>(
  action: Action,
  convex: ReturnType<typeof injectConvex>,
  destroyRef: DestroyRef,
  options: ActionOptions<Action> | undefined,
): AngularAction<Action> {
  const state = createActionState<Action>(options);

  const isSuccess = computed(() => state.hasCompleted() && !state.isLoading() && !state.error());
  const status = computed<ActionStatus>(() => {
    if (state.isLoading()) return 'pending';
    if (state.error()) return 'error';
    if (state.hasCompleted()) return 'success';
    return 'idle';
  });

  const reset = () => {
    state.currentVersion.update((v) => v + 1);
    state.data.set(undefined);
    state.error.set(undefined);
    state.isLoading.set(false);
    state.hasCompleted.set(false);
  };

  destroyRef.onDestroy(() => {
    state.isDestroyed = true;
    reset();
  });

  const call = async (
    ...args: OptionalArgsTuple<Action>
  ): Promise<FunctionReturnType<Action>> => {
    const parsedArgs = (args[0] ?? {}) as FunctionArgs<Action>;
    assertNotAccidentalArgument(parsedArgs);

    if (state.isDestroyed) {
      return convex.action(action, parsedArgs);
    }

    const callVersion = state.currentVersion() + 1;
    state.currentVersion.set(callVersion);

    try {
      state.data.set(undefined);
      state.error.set(undefined);
      state.hasCompleted.set(false);
      state.isLoading.set(true);

      const result = await convex.action(action, parsedArgs);
      if (state.currentVersion() === callVersion) {
        state.data.set(result);
        state.hasCompleted.set(true);
        options?.onSuccess?.(result);
      }
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (state.currentVersion() === callVersion) {
        state.error.set(errorObj);
        state.hasCompleted.set(true);
        options?.onError?.(errorObj);
      }
      throw errorObj;
    } finally {
      if (state.currentVersion() === callVersion) {
        state.isLoading.set(false);
      }
    }
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
  const { convex, destroyRef } = runInResolvedInjectionContext(
    injectAction,
    options?.injectRef,
    () => ({
      convex: injectConvex(),
      destroyRef: inject(DestroyRef),
    }),
  );

  return createActionHelper(action, convex, destroyRef, options);
}