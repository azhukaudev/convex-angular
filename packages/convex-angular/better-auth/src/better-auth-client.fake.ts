import { BetterAuthClientLike, BetterAuthFetchResult, BetterAuthSessionData } from './better-auth-client';

// Test double for specs only: never export it from index.ts. It is a non-spec file because several spec files share it.

export const session = (id: string): BetterAuthSessionData => ({ session: { id }, user: { id: 'user-1' } });
export const ok = <T>(data: T): BetterAuthFetchResult<T> => ({ data, error: null });
export const fail = <T>(status: number, message = 'denied'): BetterAuthFetchResult<T> => ({
  data: null,
  error: { status, message },
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FetchOptions {
  fetchOptions?: { throw?: boolean };
}

export class FakeBetterAuthClient implements BetterAuthClientLike {
  sessionResult: BetterAuthFetchResult<BetterAuthSessionData> = ok(session('s1'));
  tokenResult: BetterAuthFetchResult<{ token?: string | null }> = ok({ token: 'jwt-1' });
  tokenCalls = 0;
  sessionCalls = 0;
  updateSessionCalls = 0;
  sessionDataFallback: unknown = null;
  lastSessionOptions: FetchOptions | undefined;
  lastTokenOptions: FetchOptions | undefined;

  // A value the next call should reject with, as opposed to resolving with an
  // `{ error }` envelope. `undefined` means "resolve normally".
  sessionRejection: unknown;
  tokenRejection: unknown;

  // Queued per-call overrides so race tests can control resolution order;
  // consumed in call order, falling back to sessionResult/tokenResult.
  sessionQueue: Array<Promise<BetterAuthFetchResult<BetterAuthSessionData>>> = [];
  tokenQueue: Array<Promise<BetterAuthFetchResult<{ token?: string | null }>>> = [];

  getSession(options?: FetchOptions): Promise<BetterAuthFetchResult<BetterAuthSessionData>> {
    this.sessionCalls += 1;
    this.lastSessionOptions = options;
    return this.answer(this.sessionRejection, this.sessionQueue, this.sessionResult, options);
  }

  convex = {
    token: (options?: FetchOptions): Promise<BetterAuthFetchResult<{ token?: string | null }>> => {
      this.tokenCalls += 1;
      this.lastTokenOptions = options;
      return this.answer(this.tokenRejection, this.tokenQueue, this.tokenResult, options);
    },
  };

  getSessionData = () => this.sessionDataFallback;
  updateSession = () => {
    this.updateSessionCalls += 1;
  };

  // One response path for both endpoints: a scripted rejection first, then the next queued or default result.
  // Better Auth semantics: with `fetchOptions.throw` the client rejects with the error instead of handing back
  // the `{ data, error }` envelope.
  private async answer<T>(
    rejection: unknown,
    queue: Array<Promise<BetterAuthFetchResult<T>>>,
    fallback: BetterAuthFetchResult<T>,
    options?: FetchOptions,
  ): Promise<BetterAuthFetchResult<T>> {
    if (rejection !== undefined) {
      throw rejection;
    }
    const result = await (queue.shift() ?? fallback);
    if (options?.fetchOptions?.throw && result.error) {
      throw result.error;
    }
    return result;
  }
}
