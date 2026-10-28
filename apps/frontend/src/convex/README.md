# Demo Convex backend

This directory holds the Convex functions for the `convex-angular` demo app, including the Better Auth wiring in
`auth.ts`.

## Required deployment environment variables

These variables are set on the Convex deployment, not in `.env.local`. `auth.ts` reads them at module load and throws
if one is missing or empty, so a push fails with `Missing required environment variable <NAME>` until they are set.

- `CONVEX_SITE_URL`: provided by Convex automatically. Do not set it yourself.
- `SITE_URL`: the origin the Angular demo is served from. It is used as the trusted origin and the cross-domain target.
- `BETTER_AUTH_SECRET`: a long random secret used to sign sessions. Generate one with `openssl rand -base64 32`.

Set them with the Convex CLI:

```sh
npx convex env set SITE_URL <origin>
npx convex env set BETTER_AUTH_SECRET <secret>
```

Never commit a real secret or paste one into a file in this repository.

## Better Auth version note

This demo stays on better-auth 1.6.x because `@convex-dev/better-auth` does not yet allow 1.7: its latest release peers
`better-auth >=1.6.11 <1.7.0`.

The current critical and high better-auth advisories are fixed only in `better-auth >= 1.7.7`. They require Magic Link,
a social or Generic OAuth provider, the OAuth Proxy plugin, or device authorization. The demo enables none of these; it
uses only `emailAndPassword` plus the `crossDomain` and `convex` plugins.

Do not add any of those features before upgrading to `better-auth >= 1.7.7`, which needs a `@convex-dev/better-auth`
release that supports 1.7.

## More about Convex functions

See https://docs.convex.dev/functions for general Convex function documentation.
