import { assertInInjectionContext, inject } from '@angular/core';
import { ConvexClient } from 'convex/browser';

import { CONVEX } from '../tokens/convex';

/**
 * Inject the Convex client instance.
 *
 * This provides direct access to the ConvexClient for advanced use cases
 * that aren't covered by the other injection functions.
 *
 * @example
 * ```typescript
 * const convex = injectConvex();
 *
 * // Use the client directly
 * await convex.mutation(api.todos.create, { title: 'New todo' });
 * await convex.action(api.emails.send, { to: 'user@example.com' });
 * ```
 *
 * @returns The ConvexClient instance configured via provideConvex
 * @throws Error if called outside of an injection context or if provideConvex was not called
 */
export function injectConvex(): ConvexClient {
  assertInInjectionContext(injectConvex);
  const convex = inject(CONVEX);
  return convex;
}
