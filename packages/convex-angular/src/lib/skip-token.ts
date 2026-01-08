/**
 * A unique symbol used to indicate that a query should be skipped.
 *
 * Pass `skipToken` as the return value from `argsFn` to skip the query subscription.
 * This is useful for conditional queries where you don't want to subscribe until
 * certain conditions are met.
 *
 * @example
 * ```typescript
 * const userId = signal<string | null>(null);
 *
 * // Skip the query when userId is null
 * const user = injectQuery(
 *   api.users.get,
 *   () => userId() ? { id: userId() } : skipToken,
 * );
 *
 * // Check if the query is skipped
 * if (user.isSkipped()) {
 *   console.log('Query is skipped');
 * }
 * ```
 */
export const skipToken: unique symbol = Symbol('skipToken');

/**
 * The type of the skipToken constant.
 */
export type SkipToken = typeof skipToken;
