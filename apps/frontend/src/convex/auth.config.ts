import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';
import { AuthConfig } from 'convex/server';

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
