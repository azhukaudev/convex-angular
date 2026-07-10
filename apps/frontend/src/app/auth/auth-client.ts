import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';
import { BetterAuthClientLike } from 'convex-angular/better-auth';

import { environment } from '../../environments/environment';

function buildAuthClient() {
  return createAuthClient({
    baseURL: environment.convexSiteUrl,
    plugins: [convexClient(), crossDomainClient({ storagePrefix: 'convex-angular-demo' })],
  });
}

export type DemoAuthClient = ReturnType<typeof buildAuthClient>;

let instance: DemoAuthClient | null = null;

/** One client instance shared by provideBetterAuth() and the demo's sign-in flows. */
export function getDemoAuthClient(): DemoAuthClient {
  instance ??= buildAuthClient();
  return instance;
}

/** Adapter for provideBetterAuth(); the real client satisfies the structural contract. */
export function demoAuthClientFactory(): BetterAuthClientLike {
  return getDemoAuthClient() as unknown as BetterAuthClientLike;
}
