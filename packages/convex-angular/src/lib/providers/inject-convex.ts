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
 * @throws Error if called outside of an injection context, if provideConvex was not called,
 * or if provideConvex was configured outside the root injector
 */
export function injectConvex(): ConvexClient {
  assertInInjectionContext(injectConvex);

  // Use optional injection so we can throw a focused setup error instead of
  // Angular's generic NullInjectorError for missing CONVEX.
  const convex = inject(CONVEX, { optional: true });

  if (!convex) {
    throw new Error(
      'Could not find `CONVEX`. Make sure to call `provideConvex(...)` once in your root application providers (for example, in `app.config.ts`).',
    );
  }

  return convex;
}
