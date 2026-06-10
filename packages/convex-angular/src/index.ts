// Tokens
export * from './lib/tokens/convex';
export * from './lib/tokens/auth';

// SSR
export type { ConvexSsrOptions } from './lib/ssr/tokens';

// Types and utilities
export * from './lib/skip-token';
export * from './lib/types';
// Re-exported so consumers can narrow helper errors to Convex's typed
// application error (`err instanceof ConvexError` exposes `err.data`)
// without importing from convex/values directly.
export { ConvexError } from 'convex/values';

// Core providers
export * from './lib/providers/inject-action';
export * from './lib/providers/inject-connection-state';
export * from './lib/providers/inject-convex';
export * from './lib/providers/inject-mutation';
export * from './lib/providers/inject-paginated-query';
export * from './lib/providers/paginated-optimistic-updates';
export * from './lib/providers/inject-prewarm-query';
export * from './lib/providers/inject-queries';
export * from './lib/providers/inject-query';

// Auth providers
export * from './lib/providers/inject-auth';

// Auth integrations
export * from './lib/providers/integrations/clerk';
export * from './lib/providers/integrations/auth0';

// Auth directives
export * from './lib/directives/auth-helpers';

// Auth guards
export * from './lib/guards/auth-guards';

// Route resolvers
export * from './lib/resolvers/query-resolver';
