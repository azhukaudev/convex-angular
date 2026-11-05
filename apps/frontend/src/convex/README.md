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

The demo runs `better-auth` 1.7.x with `@convex-dev/better-auth` 0.13.x, which requires `better-auth >=1.7.16 <1.8.0`.
Bump the two packages together. `@convex-dev/better-auth` also ships its own security fixes (for example the
cross-domain one-time-token origin check in 0.12.6), and `pnpm audit` does not report those, so read its CHANGELOG
when bumping.

## More about Convex functions

See https://docs.convex.dev/functions for general Convex function documentation.
