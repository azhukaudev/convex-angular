/**
 * Shared status type for subscription-based providers (queries).
 * - 'pending': Loading initial data or resubscribing
 * - 'success': Data received successfully
 * - 'error': Subscription failed with an error
 * - 'skipped': Subscription is skipped via skipToken
 */
export type SubscriptionStatus = 'pending' | 'success' | 'error' | 'skipped';

/**
 * Status of a query subscription.
 */
export type QueryStatus = SubscriptionStatus;

/**
 * Status of a paginated query subscription.
 */
export type PaginatedQueryStatus = SubscriptionStatus;

/**
 * Shared status type for callable providers (mutations and actions).
 * - 'idle': Operation has not been called yet or was reset
 * - 'pending': Operation is in progress
 * - 'success': Operation completed successfully
 * - 'error': Operation failed with an error
 */
export type CallableStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * Status of a mutation.
 */
export type MutationStatus = CallableStatus;

/**
 * Status of an action.
 */
export type ActionStatus = CallableStatus;
