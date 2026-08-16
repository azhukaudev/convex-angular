/**
 * A hand-written stand-in for the `api` object that `convex dev` generates into
 * `src/convex/_generated/api.d.ts` in a real application.
 *
 * Documentation examples import this instead of a generated file so they can be
 * type-checked in isolation, while still exercising the same
 * `FunctionReference` machinery the real generated API uses. If a helper's
 * signature stops accepting a real function reference, these examples stop
 * compiling.
 */
import type { FunctionReference, PaginationOptions, PaginationResult } from 'convex/server';

/** Stand-in for `Id<'todos'>` from a generated data model. */
export type TodoId = string & { readonly __tableName: 'todos' };

/** Stand-in for `Doc<'todos'>` from a generated data model. */
export interface Todo {
  _id: TodoId;
  _creationTime: number;
  title: string;
  description: string;
  completed: boolean;
  priority: number;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export const api = {
  todos: {
    list: {} as FunctionReference<'query', 'public', { count: number }, Todo[]>,
    listByCategory: {} as FunctionReference<'query', 'public', { category: string }, Todo[]>,
    get: {} as FunctionReference<'query', 'public', { id: TodoId }, Todo | null>,
    listPaginated: {} as FunctionReference<
      'query',
      'public',
      { paginationOpts: PaginationOptions },
      PaginationResult<Todo>
    >,
    listPaginatedByCategory: {} as FunctionReference<
      'query',
      'public',
      { category: string; paginationOpts: PaginationOptions },
      PaginationResult<Todo>
    >,
    create: {} as FunctionReference<'mutation', 'public', { title: string }, TodoId>,
    complete: {} as FunctionReference<'mutation', 'public', { id: TodoId }, null>,
    remove: {} as FunctionReference<'mutation', 'public', { id: TodoId }, null>,
    completeAll: {} as FunctionReference<'action', 'public', Record<string, never>, number>,
  },
  users: {
    get: {} as FunctionReference<'query', 'public', { id: string }, User | null>,
    getProfile: {} as FunctionReference<'query', 'public', { userId: string }, User | null>,
    current: {} as FunctionReference<'query', 'public', Record<string, never>, User | null>,
  },
  emails: {
    send: {} as FunctionReference<'action', 'public', { to: string; subject: string }, { id: string }>,
  },
};
