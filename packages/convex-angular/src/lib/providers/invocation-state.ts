import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { FunctionArgs, FunctionReference } from 'convex/server';

import { ActionStatus, MutationStatus } from '../types';

type EmptyArgs = Record<string, never>;

type InvocationStatus = ActionStatus | MutationStatus;

export type OptionalArgsTuple<FuncRef extends FunctionReference<any>> =
  FunctionArgs<FuncRef> extends EmptyArgs ? [args?: EmptyArgs] : [args: FunctionArgs<FuncRef>];

export interface InvocationCallbacks<Result> {
  onSuccess?: (data: Result) => void;
  onError?: (err: Error) => void;
}

export interface InvocationState<Result> {
  data: WritableSignal<Result | undefined>;
  error: WritableSignal<Error | undefined>;
  isLoading: WritableSignal<boolean>;
  hasCompleted: WritableSignal<boolean>;
  currentVersion: WritableSignal<number>;
  isDestroyed: boolean;
}

export function assertNotAccidentalArgument(value: unknown, helperName: string): void {
  if (typeof Event !== 'undefined' && value instanceof Event) {
    throw new Error(
      `Convex function called with an Event object. Did you pass the helper directly as an event handler? Wrap it like \`() => ${helperName}()\` instead.`,
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
      `Convex function called with a SyntheticEvent object. Wrap the helper like \`() => ${helperName}()\` instead of using it directly as an event handler.`,
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
      `Convex function called with an event-like object. Wrap the helper like \`() => ${helperName}()\` instead of using it directly as an event handler.`,
    );
  }
}

export function createInvocationState<Result>(): InvocationState<Result> {
  return {
    data: signal<Result | undefined>(undefined),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    hasCompleted: signal(false),
    currentVersion: signal(0),
    isDestroyed: false,
  };
}

export function createInvocationSignals<Status extends InvocationStatus>(
  state: InvocationState<unknown>,
): {
  isSuccess: Signal<boolean>;
  status: Signal<Status>;
} {
  const isSuccess = computed(() => state.hasCompleted() && !state.isLoading() && !state.error());
  const status = computed<Status>(() => {
    if (state.isLoading()) return 'pending' as Status;
    if (state.error()) return 'error' as Status;
    if (state.hasCompleted()) return 'success' as Status;
    return 'idle' as Status;
  });

  return { isSuccess, status };
}

export function resetInvocationState(state: InvocationState<unknown>): void {
  state.currentVersion.update((v) => v + 1);
  state.data.set(undefined);
  state.error.set(undefined);
  state.isLoading.set(false);
  state.hasCompleted.set(false);
}

export async function runInvocation<Result>(
  state: InvocationState<Result>,
  callbacks: InvocationCallbacks<Result> | undefined,
  invoke: () => Promise<Result>,
): Promise<Result> {
  const callVersion = state.currentVersion() + 1;
  state.currentVersion.set(callVersion);

  try {
    state.data.set(undefined);
    state.error.set(undefined);
    state.hasCompleted.set(false);
    state.isLoading.set(true);

    const result = await invoke();
    if (state.currentVersion() === callVersion) {
      state.data.set(result);
      state.hasCompleted.set(true);
      callbacks?.onSuccess?.(result);
    }
    return result;
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    if (state.currentVersion() === callVersion) {
      state.error.set(errorObj);
      state.hasCompleted.set(true);
      callbacks?.onError?.(errorObj);
    }
    throw errorObj;
  } finally {
    if (state.currentVersion() === callVersion) {
      state.isLoading.set(false);
    }
  }
}
