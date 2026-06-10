import { Provider } from '@angular/core';
import { CONVEX } from 'convex-angular';
import { ConnectionState, ConvexClient } from 'convex/browser';

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
  /** Deliver a result to the subscriber, as the live WebSocket would. */
  emit: (result: unknown) => void;
  /** Deliver an error to the subscriber. */
  emitError: (err: Error) => void;
  /** True once the helper has unsubscribed. */
  unsubscribed: boolean;
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
  emit: (result: { results: unknown[]; status: string; loadMore: (n: number) => boolean }) => void;
  emitError: (err: Error) => void;
  unsubscribed: boolean;
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
  /** Resolve the invocation's promise. */
  resolve: (result: unknown) => void;
  /** Reject the invocation's promise. */
  reject: (err: Error) => void;
}

/**
 * Options for {@link MockConvexClient}.
 *
 * @public
 */
export interface MockConvexClientOptions {
  /**
   * Mirror a disabled ConvexClient (the server-side rendering state):
   * subscriptions become no-ops and the `client` getter throws, exactly like
   * the real client. Defaults to false.
   */
  disabled?: boolean;
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

  private readonly options: MockConvexClientOptions;
  private connectionStateValue = DEFAULT_CONNECTION_STATE;
  private readonly connectionStateListeners = new Set<(state: ConnectionState) => void>();
  private readonly warmCache = new Map<string, unknown>();

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
    return {
      localQueryResult: (queryName: string, args: Record<string, unknown>) =>
        this.warmCache.get(`${queryName}:${stableStringify(args)}`),
      setAuth: () => undefined,
      clearAuth: () => undefined,
      hasAuth: () => false,
    };
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
    this.warmCache.set(`${queryName}:${stableStringify(args)}`, result);
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
      return () => undefined;
    }

    const subscription: MockQuerySubscription = {
      query,
      args,
      unsubscribed: false,
      emit: (result) => onUpdate(result),
      emitError: (err) => onError?.(err),
    };
    this.querySubscriptions.push(subscription);
    return () => {
      subscription.unsubscribed = true;
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
      return () => undefined;
    }

    const subscription: MockPaginatedSubscription = {
      query,
      args,
      initialNumItems: options.initialNumItems,
      unsubscribed: false,
      emit: (result) => onUpdate(result),
      emitError: (err) => onError?.(err),
    };
    this.paginatedSubscriptions.push(subscription);
    return () => {
      subscription.unsubscribed = true;
    };
  }

  mutation(fn: unknown, args: Record<string, unknown>): Promise<unknown> {
    return this.capture(this.mutationCalls, fn, args);
  }

  action(fn: unknown, args: Record<string, unknown>): Promise<unknown> {
    return this.capture(this.actionCalls, fn, args);
  }

  getAuth(): { token: string; decoded: Record<string, unknown> } | undefined {
    return undefined;
  }

  connectionState(): ConnectionState {
    if (this.disabled) {
      throw new Error('ConvexClient is disabled');
    }
    return this.connectionStateValue;
  }

  subscribeToConnectionState(listener: (state: ConnectionState) => void): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  private capture(calls: MockCallableCall[], fn: unknown, args: Record<string, unknown>): Promise<unknown> {
    let resolve!: (result: unknown) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ fn, args, resolve, reject });
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
  return [{ provide: CONVEX, useValue: client as unknown as ConvexClient }];
}
