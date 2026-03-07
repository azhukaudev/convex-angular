import { createClient } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';

import { components } from './_generated/api';
import { query } from './_generated/server';
import authConfig from './auth.config';

const convexSiteUrl = process.env.CONVEX_SITE_URL ?? '';
const siteUrl = process.env.SITE_URL ?? '';
const betterAuthSecret = process.env.BETTER_AUTH_SECRET ?? '';

export const authComponent = createClient(components.betterAuth);

export const createAuth = (
  ctx: Parameters<typeof authComponent.adapter>[0],
) => {
  return betterAuth({
    baseURL: convexSiteUrl,
    secret: betterAuthSecret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    trustedOrigins: [siteUrl],
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
      }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await authComponent.safeGetAuthUser(
      ctx as Parameters<typeof authComponent.safeGetAuthUser>[0],
    );
    if (!user) {
      return null;
    }

    return {
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      sessionId: identity['sessionId'] as string,
      subject: identity.subject,
    };
  },
});
