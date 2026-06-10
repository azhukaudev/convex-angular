import { DestroyRef, EnvironmentInjector, Signal, inject } from '@angular/core';
import { OptimisticUpdate } from 'convex/browser';
import { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { MutationStatus } from '../types';
import { createCallableState } from './callable-state';
import { injectConvex } from './inject-convex';
import { runInResolvedInjectionContext } from './injection-context';

/**
 * A FunctionReference that refers to a Convex mutation.
 */
export type MutationReference = FunctionReference<'mutation'>;

/**
 * Options for injectMutation.
 */
export interface MutationOptions<Mutation extends MutationReference> {
  /**
   * Environment injector used to resolve dependencies when creating the
   * mutation outside the current injection context.
   */
  injectRef?: EnvironmentInjector;

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

  /**
   * Optimistic update to apply immediately before the mutation completes.
   * This allows the UI to update instantly while the mutation is in flight.
   */
  optimisticUpdate?: OptimisticUpdate<FunctionArgs<Mutation>>;
}

/**
 * The result of calling injectMutation.
 */
export interface MutationResult<Mutation extends MutationReference> {
  /**
   * Execute the mutation with the given arguments.
   * @param args - The arguments to pass to the mutation
   * @returns A promise that resolves with the mutation's return value or rejects with the mutation error
   */
  mutate: (args: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation>>;

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
 *   optimisticUpdate: (localStore, args) => {
 *     // Instantly add the new todo to the UI
 *     const todos = localStore.getQuery(api.todos.list, {});
 *     if (todos) {
 *       localStore.setQuery(api.todos.list, {}, [...todos, { ...args, _id: 'temp' }]);
 *     }
 *   },
 * });
 *
 * // In component code:
 * // async addTodo() {
 * //   try {
 * //     await createTodo.mutate({ title: 'Buy groceries' });
 * //   } catch (err) {
 * //     console.error(err);
 * //   }
 * // }
 * //
 * // @switch (createTodo.status()) {
 * //   @case ('pending') { <span>Saving...</span> }
 * //   @case ('success') { <span>Saved!</span> }
 * //   @case ('error') { <span>Error: {{ createTodo.error()?.message }}</span> }
 * // }
 * ```
 *
 * @param mutation - A FunctionReference to the mutation function
 * @param options - Optional callbacks and optimistic update configuration
 * @returns A MutationResult with mutate method and reactive state signals.
 * `mutate()` rejects on failure after updating the reactive error state.
 */
export function injectMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  options?: MutationOptions<Mutation>,
): MutationResult<Mutation> {
  const { convex, destroyRef } = runInResolvedInjectionContext(injectMutation, options?.injectRef, () => ({
    convex: injectConvex(),
    destroyRef: inject(DestroyRef),
  }));

  const state = createCallableState<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>(
    destroyRef,
    (args) => convex.mutation(mutation, args, { optimisticUpdate: options?.optimisticUpdate }),
    options,
  );

  return {
    mutate: state.execute,
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
    isSuccess: state.isSuccess,
    status: state.status,
    reset: state.reset,
  };
}
