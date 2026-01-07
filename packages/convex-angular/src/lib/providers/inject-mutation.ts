import { Signal, assertInInjectionContext, signal } from '@angular/core';
import { OptimisticUpdate } from 'convex/browser';
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';

import { injectConvex } from './inject-convex';

/**
 * A FunctionReference that refers to a Convex mutation.
 */
export type MutationReference = FunctionReference<'mutation'>;

/**
 * Options for injectMutation.
 */
export interface MutationOptions<Mutation extends MutationReference> {
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
   * @returns A promise that resolves with the mutation's return value
   */
  mutate: (
    args: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>;

  /**
   * The data returned by the last successful mutation call.
   * Undefined until the mutation completes successfully.
   */
  data: Signal<FunctionReturnType<Mutation>>;

  /**
   * The error from the last failed mutation call.
   * Undefined if the mutation hasn't failed.
   */
  error: Signal<Error | undefined>;

  /**
   * True while the mutation is running.
   */
  isLoading: Signal<boolean>;
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
 * // In template:
 * // <button (click)="createTodo.mutate({ title: 'Buy groceries' })">
 * //   Add Todo
 * // </button>
 * //
 * // @if (createTodo.isLoading()) {
 * //   <span>Saving...</span>
 * // }
 * ```
 *
 * @param mutation - A FunctionReference to the mutation function
 * @param options - Optional callbacks and optimistic update configuration
 * @returns A MutationResult with mutate method and reactive state signals
 */
export function injectMutation<Mutation extends MutationReference>(
  mutation: Mutation,
  options?: MutationOptions<Mutation>,
): MutationResult<Mutation> {
  assertInInjectionContext(injectMutation);
  const convex = injectConvex();

  // Internal signals for tracking state
  const data = signal<FunctionReturnType<Mutation>>(undefined);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);

  /**
   * Reset all state before a new mutation call.
   */
  const reset = () => {
    data.set(undefined);
    error.set(undefined);
    isLoading.set(false);
  };

  /**
   * Execute the mutation with the given arguments.
   */
  const mutate = async (
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> => {
    try {
      reset();
      isLoading.set(true);

      const result = await convex.mutation(mutation, args, {
        optimisticUpdate: options?.optimisticUpdate,
      });
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
    mutate,
    data: data.asReadonly(),
    error: error.asReadonly(),
    isLoading: isLoading.asReadonly(),
  };
}
