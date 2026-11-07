import { Provider } from '@angular/core';
import { AuthTokenFetcher, CONVEX } from 'convex-angular';
import type { BaseConvexClient, ConnectionState, ConvexClient } from 'convex/browser';
import { getFunctionName } from 'convex/server';
import { Value, convexToJson } from 'convex/values';

/**
 * The `ConvexClient` surface the library and its own specs actually call on
 * the client under the `CONVEX` token. This is what {@link MockConvexClient}
 * must keep satisfying; a drifted mock member becomes a compile error here
 * instead of a runtime surprise for a consumer.
 *
 * The four internal `client` members (`setAuth`, `clearAuth`, `hasAuth`,
 * `localQueryResult`) are checked against the real `BaseConvexClient`, so a
 * drifted upstream signature fails to compile here.
 *
 * Several members are narrower than the real `ConvexClient`, deliberately:
 *
 * - `onUpdate`/`onPaginatedUpdate_experimental`: every call site treats the
 *   return value as a plain unsubscribe function, never using the extra
 *   `.unsubscribe()`/`.getCurrentValue()` properties the real client's
 *   `Unsubscribe<T>` return type carries.
 * - `mutation`/`action`/`query`: the real client's generic
 *   `<Fn extends FunctionReference<...>>(...): Promise<Awaited<FunctionReturnType<Fn>>>`
 *   forms do not assignment-check against the mock's `Promise<unknown>`
 *   returns (the generic result type isn't structurally `unknown`-compatible),
 *   so these narrow to the mock's actual, looser return type.
 *
 * @internal
 */
type UsedConvexClientSurface = Pick<
  ConvexClient,
  'disabled' | 'close' | 'getAuth' | 'connectionState' | 'subscribeToConnectionState'
> & {
  mutation: (mutation: unknown, args: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  action: (action: unknown, args: Record<string, unknown>) => Promise<unknown>;
  query: (query: unknown, args: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (
    query: unknown,
    args: Record<string, unknown>,
    onUpdate: (result: unknown) => unknown,
    onError?: (err: Error) => unknown,
  ) => () => void;
  onPaginatedUpdate_experimental: (
    query: unknown,
    args: Record<string, unknown>,
    options: { initialNumItems: number },
    onUpdate: (result: unknown) => unknown,
    onError?: (err: Error) => unknown,
  ) => () => void;
  client: Pick<BaseConvexClient, 'setAuth' | 'clearAuth' | 'hasAuth' | 'localQueryResult'>;
};

/**
 * A query subscription captured by {@link MockConvexClient}.
 * Drive the helper under test by calling `emit` / `emitError`.
 *
 * @public
 */
export interface MockQuerySubscription {
  /** The query function reference passed to the helper. */
  query: unknown;
  /** The args the helper subscribed with. */
  args: Record<string, unknown>;
  /** Deliver a result to the subscriber, as the live WebSocket would; a no-op once the helper has unsubscribed. */
  emit: (result: unknown) => void;
  /** Deliver an error to the subscriber; a no-op once the helper has unsubscribed. */
  emitError: (err: Error) => void;
  /**
   * Invoke the retired callback directly, bypassing the unsubscribe gate.
   *
   * The real client cannot do this — `unsubscribe()` synchronously removes the
   * listener before returning, so a later dispatch never reaches it. This
   * exists only to exercise a helper's defensive staleness or generation guard,
   * which is otherwise unreachable. Prefer {@link MockQuerySubscription.emit}
   * everywhere else; reaching for this in a test of ordinary behaviour asserts
   * against a client that does not exist.
   */
  emitAfterUnsubscribe: (result: unknown) => void;
  /** The {@link MockQuerySubscription.emitAfterUnsubscribe} counterpart for errors. */
  emitErrorAfterUnsubscribe: (err: Error) => void;
  /** True once the helper has unsubscribed. */
  unsubscribed: boolean;
  /** How many times the helper invoked the unsubscribe function. */
  unsubscribeCount: number;
}

/**
 * A paginated query subscription captured by {@link MockConvexClient}.
 * `emit` takes the client-shaped paginated result
 * (`{ results, status, loadMore }`).
 *
 * @public
 */
export interface MockPaginatedSubscription {
  query: unknown;
  args: Record<string, unknown>;
  initialNumItems: number;
  /** Deliver a result to the subscriber, as the live WebSocket would; a no-op once the helper has unsubscribed. */
  emit: (result: { results: unknown[]; status: string; loadMore: (n: number) => boolean }) => void;
  /** Deliver an error to the subscriber; a no-op once the helper has unsubscribed. */
  emitError: (err: Error) => void;
  /**
   * Invoke the retired callback directly, bypassing the unsubscribe gate. The
   * real client cannot do this; see
   * {@link MockQuerySubscription.emitAfterUnsubscribe} for why it exists and
   * when not to reach for it.
   */
  emitAfterUnsubscribe: (result: { results: unknown[]; status: string; loadMore: (n: number) => boolean }) => void;
  /** The {@link MockPaginatedSubscription.emitAfterUnsubscribe} counterpart for errors. */
  emitErrorAfterUnsubscribe: (err: Error) => void;
  unsubscribed: boolean;
  /** How many times the helper invoked the unsubscribe function. */
  unsubscribeCount: number;
}

/**
 * A subscription a disabled {@link MockConvexClient} skipped rather than
 * established. The call itself succeeds and returns a no-op unsubscribe, as the
 * real disabled client does; recording it is what lets a test prove a helper
 * never attempted to subscribe, which a silently dropped call cannot.
 *
 * @public
 */
export interface MockRefusedSubscription {
  /** Which subscription API the helper reached for. */
  kind: 'query' | 'paginated';
  /** The query function reference the helper passed. */
  query: unknown;
  /** The args the helper tried to subscribe with. */
  args: Record<string, unknown>;
}

/**
 * A mutation or action invocation captured by {@link MockConvexClient}.
 * Settle it with `resolve` / `reject` to drive the helper's reactive state.
 *
 * @public
 */
export interface MockCallableCall {
  /** The mutation/action function reference. */
  fn: unknown;
  /** The args of the invocation. */
  args: Record<string, unknown>;
  /**
   * The options object the helper passed, if any. `injectMutation` forwards
   * `{ optimisticUpdate }` here; `injectAction` passes nothing.
   */
  options: Record<string, unknown> | undefined;
  /** Resolve the invocation's promise. */
  resolve: (result: unknown) => void;
  /**
   * Reject the invocation's promise. Accepts a non-Error rejection value so a
   * test can prove the helper normalizes whatever the wire threw.
   */
  reject: (err: unknown) => void;
}

/**
 * An authentication registration captured by {@link MockConvexClient}, made by
 * the helper under test through `client.setAuth`.
 *
 * The real client owns the token lifecycle and calls back into the helper; drive
 * that side of the conversation with `fetchToken`, `setAuthenticated` and
 * `setRefreshing`.
 *
 * @public
 */
export interface MockAuthRegistration {
  /**
   * The token fetcher the helper registered. Await it to simulate Convex asking
   * for a token. The real client calls it synchronously inside setAuth and again
   * on expiry or rejection; the mock never calls it on its own.
   */
  fetchToken: AuthTokenFetcher;
  /**
   * Report the authentication outcome back to the helper. This is only the
   * notification; use {@link MockConvexClient.seedAuth} to give the client the
   * token that `hasAuth()` and `getAuth()` report.
   */
  setAuthenticated: (isAuthenticated: boolean) => void;
  /**
   * Report a token refresh starting or finishing. A no-op when the helper did
   * not register an `onRefreshChange` callback.
   */
  setRefreshing: (isRefreshing: boolean) => void;
  /**
   * True once `client.clearAuth()` has run since this registration was made.
   * Recorded only: the real `clearAuth` drops the token without tearing down
   * the authentication manager's config, so a cleared registration can still
   * call back and this mock lets it.
   */
  cleared: boolean;
}

/**
 * A `client.localQueryResult` lookup captured by {@link MockConvexClient}.
 *
 * @public
 */
export interface MockLocalQueryResultCall {
  /** The query name the helper looked up, e.g. `'todos:list'`. */
  queryName: string;
  /** The args the helper looked the result up with. */
  args: Record<string, unknown> | undefined;
}

/**
 * Options for {@link MockConvexClient}.
 *
 * @public
 */
export interface MockConvexClientOptions {
  /**
   * Mirror a disabled ConvexClient (the server-side rendering state):
   * subscriptions become no-ops, the `client` getter throws, and
   * `mutation()`/`action()`/`query()` reject with `'ConvexClient is
   * disabled'`, exactly like the real client. Defaults to false.
   */
  disabled?: boolean;
}

/**
 * Throws what the real client throws for args that are not Convex values (a `Set`, a `Map`, a `Date`, a class
 * instance, an `undefined` inside an array, a `$`-prefixed field name, …). Both real subscribe paths serialize
 * the args with `convexToJson` before registering anything, so nothing is recorded when this throws.
 */
function assertConvexValueArgs(args: Record<string, unknown>): void {
  // The public signature stays `unknown`-typed on purpose (see `seedQueryResult`); the check is the point.
  convexToJson(args as Record<string, Value>);
}

// Key-order-independent serialization so seeded results are found regardless
// of the property order the component happens to build its args with.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
};

/**
 * An in-memory stand-in for ConvexClient, for unit-testing components and
 * services that use convex-angular helpers without a real Convex deployment.
 *
 * Every subscription and invocation the helpers make is captured so the test
 * can drive it: emit query results, settle mutations, change the connection
 * state, or pre-seed the warm cache.
 *
 * @example
 * ```typescript
 * const convex = new MockConvexClient();
 *
 * TestBed.configureTestingModule({
 *   providers: [provideConvexTesting(convex)],
 * });
 *
 * const fixture = TestBed.createComponent(TodoListComponent);
 * fixture.detectChanges();
 *
 * convex.lastQuerySubscription()!.emit([{ _id: '1', title: 'Todo' }]);
 * fixture.detectChanges();
 *
 * expect(fixture.nativeElement.textContent).toContain('Todo');
 * ```
 *
 * @public
 */
export class MockConvexClient {
  /** Every live-query subscription made through onUpdate, oldest first. */
  readonly querySubscriptions: MockQuerySubscription[] = [];
  /** Every paginated subscription, oldest first. */
  readonly paginatedSubscriptions: MockPaginatedSubscription[] = [];
  /** Every mutation invocation, oldest first. */
  readonly mutationCalls: MockCallableCall[] = [];
  /** Every action invocation, oldest first. */
  readonly actionCalls: MockCallableCall[] = [];
  /** Every auth registration made through `client.setAuth`, oldest first. */
  readonly authRegistrations: MockAuthRegistration[] = [];
  /** Every `client.localQueryResult` lookup, oldest first. */
  readonly localQueryResultCalls: MockLocalQueryResultCall[] = [];
  /**
   * Every subscription a disabled client skipped rather than established,
   * oldest first. The call itself succeeds and hands back a no-op unsubscribe,
   * exactly as the real disabled client does; recording it is what lets a test
   * prove server-side code never attempted to subscribe.
   */
  readonly refusedSubscriptions: MockRefusedSubscription[] = [];

  private readonly options: MockConvexClientOptions;
  private connectionStateValue = DEFAULT_CONNECTION_STATE;
  private readonly connectionStateListeners = new Set<(state: ConnectionState) => void>();
  private readonly warmCache = new Map<string, { ok: Value } | { err: Error }>();
  private authSnapshot: { token: string; decoded: Record<string, unknown> } | undefined;
  private clearAuthCallCount = 0;
  private hasAuthCallCount = 0;
  private connectionStateReadCount = 0;
  private connectionStateSubscribeCount = 0;
  private connectionStateUnsubscribeCount = 0;
  private readonly lowLevelClient = {
    localQueryResult: (queryName: string, args?: Record<string, unknown>) => {
      this.localQueryResultCalls.push({ queryName, args });
      const entry = this.warmCache.get(`${queryName}:${stableStringify(args)}`);
      if (entry === undefined) {
        return undefined;
      }
      if ('err' in entry) {
        // Mirrors the real client: a warm cache entry for a failed query
        // throws from localQueryResult rather than returning a value.
        throw entry.err;
      }
      return entry.ok;
    },
    setAuth: (
      fetchToken: AuthTokenFetcher,
      onChange?: (isAuthenticated: boolean) => void,
      onRefreshChange?: (isRefreshing: boolean) => void,
    ) => {
      const registration: MockAuthRegistration = {
        fetchToken,
        cleared: false,
        // Registration is configuration, not authentication: the real client
        // keeps calling these back after clearAuth, because clearAuth drops the
        // token without resetting the authentication manager's config.
        setAuthenticated: (isAuthenticated) => onChange?.(isAuthenticated),
        setRefreshing: (isRefreshing) => onRefreshChange?.(isRefreshing),
      };
      this.authRegistrations.push(registration);
    },
    clearAuth: () => {
      this.clearAuthCallCount++;
      for (const registration of this.authRegistrations) {
        registration.cleared = true;
      }
      this.authSnapshot = undefined;
    },
    // Mirrors BaseConvexClient.hasAuth, which reports whether a token is held,
    // not whether a fetcher was registered. Seed one with `seedAuth`.
    hasAuth: () => {
      this.hasAuthCallCount++;
      return this.authSnapshot !== undefined;
    },
  };

  constructor(options: MockConvexClientOptions = {}) {
    this.options = options;
  }

  get disabled(): boolean {
    return this.options.disabled ?? false;
  }

  /** Mirrors ConvexClient: the low-level client throws when disabled. */
  get client() {
    if (this.disabled) {
      throw new Error('ConvexClient is disabled');
    }
    return this.lowLevelClient;
  }

  /** How many times the helper called `client.clearAuth`. */
  get clearAuthCount(): number {
    return this.clearAuthCallCount;
  }

  /**
   * How many times the helper consulted `client.hasAuth`. Distinguishes "asked
   * and declined to clear" from "never looked".
   */
  get hasAuthCount(): number {
    return this.hasAuthCallCount;
  }

  /** How many times the helper read `connectionState()`. */
  get connectionStateReads(): number {
    return this.connectionStateReadCount;
  }

  /**
   * How many times the helper called `subscribeToConnectionState()`, including
   * calls a disabled client refused to register.
   */
  get connectionStateSubscriptions(): number {
    return this.connectionStateSubscribeCount;
  }

  /** How many times the helper released a connection-state subscription. */
  get connectionStateUnsubscribes(): number {
    return this.connectionStateUnsubscribeCount;
  }

  /** The most recent auth registration, if any. */
  lastAuthRegistration(): MockAuthRegistration | undefined {
    return this.authRegistrations[this.authRegistrations.length - 1];
  }

  /**
   * The most recent auth registration; throws when `setAuth` was never called.
   * Use it to drive Convex's side of the auth handshake without narrowing `lastAuthRegistration()`.
   */
  requireLastAuthRegistration(): MockAuthRegistration {
    const registration = this.lastAuthRegistration();
    if (!registration) {
      throw new Error('Expected client.setAuth() to have registered auth, but no registration was captured.');
    }
    return registration;
  }

  /**
   * Give the client a token, as the real client holds one once its fetcher has
   * resolved. This is the single source of current auth: it is what `getAuth()`
   * reports and what makes `client.hasAuth()` true, and `client.clearAuth()`
   * drops it. Pass `undefined` to start from unauthenticated.
   */
  seedAuth(auth: { token: string; decoded: Record<string, unknown> } | undefined): void {
    this.authSnapshot = auth;
  }

  /** The most recent live-query subscription, if any. */
  lastQuerySubscription(): MockQuerySubscription | undefined {
    return this.querySubscriptions[this.querySubscriptions.length - 1];
  }

  /** The most recent paginated subscription, if any. */
  lastPaginatedSubscription(): MockPaginatedSubscription | undefined {
    return this.paginatedSubscriptions[this.paginatedSubscriptions.length - 1];
  }

  /**
   * Pre-seed the warm local cache consulted by injectQuery/injectQueries
   * before their subscription delivers.
   */
  seedQueryResult(queryName: string, args: Record<string, unknown>, result: unknown): void {
    // Public signature stays `unknown` (fixtures are often interface-typed);
    // the real client's cache only ever holds Convex values.
    this.warmCache.set(`${queryName}:${stableStringify(args)}`, { ok: result as Value });
  }

  /**
   * Pre-seed the warm local cache with a failed result, as when the
   * deployment already rejected this exact query + args before the helper
   * subscribed. Mirrors the real client: `client.localQueryResult` throws
   * this error instead of returning a value, and `query()` rejects with it.
   */
  seedQueryError(queryName: string, args: Record<string, unknown>, error: Error): void {
    this.warmCache.set(`${queryName}:${stableStringify(args)}`, { err: error });
  }

  /** Push a new connection state to injectConvexConnectionState consumers. */
  setConnectionState(state: Partial<ConnectionState>): void {
    this.connectionStateValue = { ...this.connectionStateValue, ...state };
    for (const listener of this.connectionStateListeners) {
      listener(this.connectionStateValue);
    }
  }

  // ConvexClient surface used by the helpers.

  onUpdate(
    query: unknown,
    args: Record<string, unknown>,
    onUpdate: (result: unknown) => unknown,
    onError?: (err: Error) => unknown,
  ): () => void {
    if (this.disabled) {
      this.refusedSubscriptions.push({ kind: 'query', query, args });
      return () => undefined;
    }

    assertConvexValueArgs(args);

    const subscription: MockQuerySubscription = {
      query,
      args,
      unsubscribed: false,
      unsubscribeCount: 0,
      // Mirrors the real client: nothing is delivered after unsubscribe.
      emit: (result) => {
        if (!subscription.unsubscribed) {
          onUpdate(result);
        }
      },
      emitError: (err) => {
        if (!subscription.unsubscribed) {
          onError?.(err);
        }
      },
      // Deliberately ungated; see the interface docs for why.
      emitAfterUnsubscribe: (result) => onUpdate(result),
      emitErrorAfterUnsubscribe: (err) => onError?.(err),
    };
    this.querySubscriptions.push(subscription);
    return () => {
      subscription.unsubscribed = true;
      subscription.unsubscribeCount++;
    };
  }

  onPaginatedUpdate_experimental(
    query: unknown,
    args: Record<string, unknown>,
    options: { initialNumItems: number },
    onUpdate: (result: unknown) => unknown,
    onError?: (err: Error) => unknown,
  ): () => void {
    if (this.disabled) {
      this.refusedSubscriptions.push({ kind: 'paginated', query, args });
      return () => undefined;
    }

    assertConvexValueArgs(args);

    const subscription: MockPaginatedSubscription = {
      query,
      args,
      initialNumItems: options.initialNumItems,
      unsubscribed: false,
      unsubscribeCount: 0,
      // Mirrors the real client: nothing is delivered after unsubscribe.
      emit: (result) => {
        if (!subscription.unsubscribed) {
          onUpdate(result);
        }
      },
      emitError: (err) => {
        if (!subscription.unsubscribed) {
          onError?.(err);
        }
      },
      // Deliberately ungated; see the interface docs for why.
      emitAfterUnsubscribe: (result) => onUpdate(result),
      emitErrorAfterUnsubscribe: (err) => onError?.(err),
    };
    this.paginatedSubscriptions.push(subscription);
    return () => {
      subscription.unsubscribed = true;
      subscription.unsubscribeCount++;
    };
  }

  mutation(fn: unknown, args: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown> {
    if (this.disabled) {
      return Promise.reject(new Error('ConvexClient is disabled'));
    }
    return this.capture(this.mutationCalls, fn, args, options);
  }

  // Mirrors ConvexClient.action, which takes no options object.
  action(fn: unknown, args: Record<string, unknown>): Promise<unknown> {
    if (this.disabled) {
      return Promise.reject(new Error('ConvexClient is disabled'));
    }
    return this.capture(this.actionCalls, fn, args, undefined);
  }

  /**
   * Run a one-shot query, following the real client exactly: serve a warm-cache
   * hit seeded by {@link MockConvexClient.seedQueryResult}, and on a miss open a
   * subscription and stay pending until it delivers.
   *
   * A miss therefore appears in {@link MockConvexClient.querySubscriptions};
   * settle it with the subscription's `emit` or `emitError`.
   */
  query(fn: unknown, args: Record<string, unknown>): Promise<unknown> {
    if (this.disabled) {
      return Promise.reject(new Error('ConvexClient is disabled'));
    }

    const queryName = getFunctionName(fn as Parameters<typeof getFunctionName>[0]);
    let cached: unknown;
    try {
      cached = this.lowLevelClient.localQueryResult(queryName, args);
    } catch (err) {
      // The real ConvexClient.query is async, so a synchronous throw from the
      // underlying localQueryResult surfaces as a rejection here.
      return Promise.reject(err);
    }
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      const unsubscribe = this.onUpdate(
        fn,
        args,
        (result) => {
          unsubscribe();
          resolve(result);
        },
        (err) => {
          unsubscribe();
          reject(err);
        },
      );
    });
  }

  getAuth(): { token: string; decoded: Record<string, unknown> } | undefined {
    // Mirrors the real client, which has no auth state at all when disabled.
    return this.disabled ? undefined : this.authSnapshot;
  }

  connectionState(): ConnectionState {
    // Counted before the disabled throw so `connectionStateReads` records the
    // attempt: a helper that must never read it when disabled is provable.
    this.connectionStateReadCount++;
    if (this.disabled) {
      throw new Error('ConvexClient is disabled');
    }
    return this.connectionStateValue;
  }

  subscribeToConnectionState(listener: (state: ConnectionState) => void): () => void {
    this.connectionStateSubscribeCount++;
    // Mirrors the real client: a disabled client never registers the listener.
    if (this.disabled) {
      return () => undefined;
    }
    this.connectionStateListeners.add(listener);
    return () => {
      this.connectionStateUnsubscribeCount++;
      this.connectionStateListeners.delete(listener);
    };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  private capture(
    calls: MockCallableCall[],
    fn: unknown,
    args: Record<string, unknown>,
    options: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    let resolve!: (result: unknown) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ fn, args, options, resolve, reject });
    return promise;
  }
}

/**
 * Provide a {@link MockConvexClient} as the Convex client for a TestBed.
 *
 * @example
 * ```typescript
 * const convex = new MockConvexClient();
 * TestBed.configureTestingModule({
 *   providers: [provideConvexTesting(convex)],
 * });
 * ```
 *
 * @param client - The mock instance the test drives; defaults to a fresh one
 * @returns Providers registering the mock under the CONVEX token
 *
 * @public
 */
export function provideConvexTesting(client: MockConvexClient = new MockConvexClient()): Provider[] {
  // Fully compiler-checked: a drifted mock member fails this assignment, not
  // just overlap (a plain `as UsedConvexClientSurface` assertion only needs
  // the two types to overlap, which is weaker than an assignability check).
  const surface: UsedConvexClientSurface = client;
  return [{ provide: CONVEX, useValue: surface as ConvexClient }];
}
