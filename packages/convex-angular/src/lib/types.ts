/**
 * Status of a query subscription.
 * - 'pending': Loading initial data or resubscribing
 * - 'success': Data received successfully
 * - 'error': Query failed with an error
 * - 'skipped': Query is skipped via skipToken
 */
export type QueryStatus = 'pending' | 'success' | 'error' | 'skipped';

/**
 * Status of a paginated query subscription.
 * - 'pending': Loading the first page
 * - 'success': First page loaded successfully
 * - 'error': Query failed with an error
 * - 'skipped': Query is skipped via skipToken
 */
export type PaginatedQueryStatus = 'pending' | 'success' | 'error' | 'skipped';

/**
 * Status of a mutation.
 * - 'idle': Mutation has not been called yet or was reset
 * - 'pending': Mutation is in progress
 * - 'success': Mutation completed successfully
 * - 'error': Mutation failed with an error
 */
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * Status of an action.
 * - 'idle': Action has not been called yet or was reset
 * - 'pending': Action is in progress
 * - 'success': Action completed successfully
 * - 'error': Action failed with an error
 */
export type ActionStatus = 'idle' | 'pending' | 'success' | 'error';
