/**
 * The session snapshot shape returned by Better Auth.
 * Extra fields on `user` are preserved but untyped.
 *
 * @public
 */
export interface BetterAuthSessionData {
  session: { id: string; expiresAt?: string | Date };
  user: { id: string } & Record<string, unknown>;
}

/**
 * Better Auth's `{ data, error }` fetch result envelope.
 *
 * @public
 */
export interface BetterAuthFetchResult<T> {
  data: T | null;
  error: { message?: string; status?: number } | null;
}

/**
 * The minimal, structurally-typed surface convex-angular needs from a Better
 * Auth client. A client created with
 * `createAuthClient({ plugins: [convexClient(), crossDomainClient()] })`
 * satisfies it. Typed structurally on purpose: the library has no dependency
 * on better-auth packages, so their releases cannot break this integration.
 *
 * @public
 */
export interface BetterAuthClientLike {
  getSession(options?: { fetchOptions?: { throw?: boolean } }): Promise<BetterAuthFetchResult<BetterAuthSessionData>>;

  /** Provided by the convexClient() plugin: exchanges the session for a Convex JWT. */
  convex: {
    token(options?: { fetchOptions?: { throw?: boolean } }): Promise<BetterAuthFetchResult<{ token?: string | null }>>;
  };

  /** Cross-domain plugin extras; used when present. */
  getSessionData?(): BetterAuthSessionData | null;
  updateSession?(): void;
}
