import { DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { OptimisticUpdate } from 'convex/browser';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { MutationStatus } from '../types';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

/**
 * A FunctionReference that refers to a Convex mutation.
 */
export type MutationReference = FunctionReference<'mutation'>;

type EmptyArgs = Record<string, never>;

type OptionalArgsTuple<FuncRef extends FunctionReference<any>> =
  FunctionArgs<FuncRef> extends EmptyArgs ? [args?: EmptyArgs] : [args: FunctionArgs<FuncRef>];

function assertNotAccidentalArgument(value: unknown): void {
  if (typeof Event !== 'undefined' && value instanceof Event) {
    throw new Error(
      'Convex function called with an Event object. Did you pass the helper directly as an event handler? Wrap it like `() => myMutation()` instead.',
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
      'Convex function called with a SyntheticEvent object. Wrap the helper like `() => myMutation()` instead of using it directly as an event handler.',
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
      'Convex function called with an event-like object. Wrap the helper like `() => myMutation()` instead of using it directly as an event handler.',
    );
  }
}

/**
 * Options for injectMutation.
 */
export interface MutationOptions<Mutation extends MutationReference> {
  /**
   * Environment injector used to resolve dependencies when creating the
   * mutation outside the current injection context.
   */
  injectRef?: import('@angular/core').EnvironmentInjector;

  /**
   * Callback invoked when the mutation completes successfully.
   * @param data - The return value of the mutation
   */
  onSuccess?: (data: FunctionReturnType<Mutation>) => void;

  /**
   * Callback invoked when the mutation fails.
   * @param err - The error that occurred
   */
  onError?: (err: Error) => void;
}

/**
 * A callable mutation helper returned by injectMutation.
 *
 * Call it directly to execute the mutation:
 * ```typescript
 * await addTodo({ title: 'Buy groceries' });
 * ```
 *
 * Use `.withOptimisticUpdate(...)` to configure optimistic updates:
 * ```typescript
 * const optimisticAddTodo = addTodo.withOptimisticUpdate((localStore, args) => {
 *   // Optimistically update local query results
 * });
 * await optimisticAddTodo({ title: 'Buy groceries' });
 * ```
 */
export interface AngularMutation<Mutation extends MutationReference> {
  (...args: OptionalArgsTuple<Mutation>): Promise<FunctionReturnType<Mutation>>;

  withOptimisticUpdate<T extends OptimisticUpdate<FunctionArgs<Mutation>>>(
    optimisticUpdate: T &
      (ReturnType<T> extends Promise<any> ? 'Optimistic update handlers must be synchronous' : unknown),
  ): AngularMutation<Mutation>;

  /**
   * The data returned by the last successful mutation call.
   * Undefined until the mutation completes successfully.
   */
  data: Signal<FunctionReturnType<Mutation> | undefined>;

  /**
   * The error from the last failed mutation call.
   * Undefined if the mutation hasn't failed.
   */
  error: Signal<Error | undefined>;

  /**
   * True while the mutation is running.
   */
  isLoading: Signal<boolean>;

  /**
   * True when the mutation completed successfully.
   * False when idle, loading, or when there's an error.
   */
  isSuccess: Signal<boolean>;

  /**
   * The current status of the mutation.
   * - 'idle': Mutation has not been called yet or was reset
   * - 'pending': Mutation is in progress
   * - 'success': Mutation completed successfully
   * - 'error': Mutation failed with an error
   */
  status: Signal<MutationStatus>;

  /**
   * Reset the mutation state (data, error, isLoading).
   * Useful for resetting form state after navigation.
   */
  reset: () => void;
}

interface MutationState<Mutation extends MutationReference> {
  data: WritableSignal<FunctionReturnType<Mutation> | undefined>;
  error: WritableSignal<Error | undefined>;
  isLoading: WritableSignal<boolean>;
  hasCompleted: WritableSignal<boolean>;
  currentVersion: WritableSignal<number>;
  isDestroyed: boolean;
  onSuccess?: (data: FunctionReturnType<Mutation>) => void;
  onError?: (err: Error) => void;
}

function createMutationState<Mutation extends MutationReference>(
  options?: MutationOptions<Mutation>,
): MutationState<Mutation> {
  return {
    data: signal<FunctionReturnType<Mutation> | undefined>(undefined),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    hasCompleted: signal(false),
    currentVersion: signal(0),
    isDestroyed: false,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  };
}

function createMutationHelper<Mutation extends MutationReference>(
  mutation: Mutation,
  convex: ReturnType<typeof injectConvex>,
  destroyRef: DestroyRef,
  options: MutationOptions<Mutation> | undefined,
  optimisticUpdate: OptimisticUpdate<FunctionArgs<Mutation>> | undefined,
): AngularMutation<Mutation> {
  const state = createMutationState<Mutation>(options);

  const isSuccess = computed(() => state.hasCompleted() && !state.isLoading() && !state.error());
  const status = computed<MutationStatus>(() => {
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

  const call = async (...args: OptionalArgsTuple<Mutation>): Promise<FunctionReturnType<Mutation>> => {
    const parsedArgs = (args[0] ?? {}) as FunctionArgs<Mutation>;
    assertNotAccidentalArgument(parsedArgs);

    if (state.isDestroyed) {
      return convex.mutation(mutation, parsedArgs, {
        optimisticUpdate,
      });
    }

    const callVersion = state.currentVersion() + 1;
    state.currentVersion.set(callVersion);

    try {
      state.data.set(undefined);
      state.error.set(undefined);
      state.hasCompleted.set(false);
      state.isLoading.set(true);

      const result = await convex.mutation(mutation, parsedArgs, {
        optimisticUpdate,
      });
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

  const withOptimisticUpdate = <T extends OptimisticUpdate<FunctionArgs<Mutation>>>(
    nextOptimisticUpdate: T &
      (ReturnType<T> extends Promise<any> ? 'Optimistic update handlers must be synchronous' : unknown),
  ): AngularMutation<Mutation> => {
    if (optimisticUpdate !== undefined) {
      throw new Error(
        `Already specified optimistic update for mutation ${(mutation as any)._name ?? 'unknown mutation'}`,
      );
    }
    return createMutationHelper(mutation, convex, destroyRef, options, nextOptimisticUpdate);
  };

  return Object.assign(call, {
    withOptimisticUpdate,
    data: state.data.asReadonly(),
    error: state.error.asReadonly(),
    isLoading: state.isLoading.asReadonly(),
    isSuccess,
    status,
    reset,
  }) as AngularMutation<Mutation>;
}

/**
 * Create a reactive mutation caller.
 *
 * Mutations are used for modifying data in the Convex database.
 * They provide optimistic update support for instant UI feedback.
 *
 * @example
 * ```typescript
 * const createTodo = injectMutation(api.todos.create, {
 *   onSuccess: (result) => console.log('Created todo:', result),
 *   onError: (err) => console.error('Failed to create todo', err),
 * });
 *
 * // Call directly:
 * await createTodo({ title: 'Buy groceries' });
 *
 * // With optimistic update:
 * const optimisticCreateTodo = createTodo.withOptimisticUpdate((localStore, args) => {
 *   const todos = localStore.getQuery(api.todos.list, {});
 *   if (todos) {
 *     localStore.setQuery(api.todos.list, {}, [...todos, { ...args, _id: 'temp' }]);
 *   }
 * });
 * await optimisticCreateTodo({ title: 'Buy groceries' });
 *
 * // In template:
 * // @switch (createTodo.status()) {
 * //   @case ('pending') { <span>Saving...</span> }
 * //   @case ('success') { <span>Saved!</span> }
 * //   @case ('error') { <span>Error: {{ createTodo.error()?.message }}</span> }
 * // }
 * ```
 *
 * @param mutation - A FunctionReference to the mutation function
 * @param options - Optional callbacks for success and error handling
 * @returns An AngularMutation callable helper with reactive state signals.
 */
export function injectMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  options?: MutationOptions<Mutation>,
): AngularMutation<Mutation> {
  const { convex, destroyRef } = runInResolvedInjectionContext(injectMutation, options?.injectRef, () => ({
    convex: injectConvex(),
    destroyRef: inject(DestroyRef),
  }));

  return createMutationHelper(mutation, convex, destroyRef, options, undefined);
}
