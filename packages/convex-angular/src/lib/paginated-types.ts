import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';

/**
 * A FunctionReference that is usable with injectPaginatedQuery.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type PaginationOptions
 * - Have a return type of PaginationResult
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<any>
>;

/**
 * Given a PaginatedQueryReference, get the type of the arguments
 * object for the query, excluding the paginationOpts argument.
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<FunctionArgs<Query>, 'paginationOpts'>;

/**
 * Given a PaginatedQueryReference, get the type of the item being paginated over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> = FunctionReturnType<Query>['page'][number];
