import { ConvexClient, PaginationStatus } from 'convex/browser';
import { FunctionReference, PaginationOptions } from 'convex/server';

import type { PaginatedQueryReference } from '../paginated-types';
import {
  DISABLED_CONNECTION_STATE,
  clearAuth,
  hasAuth,
  localQueryResult,
  paginationOptsId,
  setAuthWithRefresh,
  subscribeToPaginatedQuery,
} from './convex-client-internals';

// Enough of the WebSocket surface for ConvexClient to construct and close
// without opening a real connection. Copied from tokens/convex.spec.ts.
const fakeWebSocketConstructor = class {
  close() {}
  addEventListener() {}
  removeEventListener() {}
  send() {}
} as unknown as typeof WebSocket;

type SentMessage = { type: string; [key: string]: unknown };

// A WebSocket the spec can drive by hand. The real manager assigns
// `onopen`/`onmessage`/`onclose` as properties (not via `addEventListener`) and
// `send()`s JSON text, so this records what the client sends and lets the spec
// answer with server transitions.
function createDrivenWebSocket() {
  const sent: SentMessage[] = [];
  type Instance = { onopen?: () => void; onmessage?: (event: { data: string }) => void };
  const instances: Instance[] = [];
  const webSocketConstructor = class {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() {
      instances.push(this);
    }
    close() {}
    send(data: string) {
      sent.push(JSON.parse(data) as SentMessage);
    }
  } as unknown as typeof WebSocket;

  const encodeTimestamp = (n: number) => Buffer.from([n, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
  let serverTimestamp = 0;
  let serverQuerySetVersion = 0;

  return {
    webSocketConstructor,
    sent,
    open() {
      instances.at(-1)?.onopen?.();
    },
    /** The `queryId`s the client assigned to every query it added for this path. */
    queryIdsFor(udfPath: string): number[] {
      return sent
        .filter((message) => message.type === 'ModifyQuerySet')
        .flatMap((message) => message['modifications'] as { type: string; queryId: number; udfPath: string }[])
        .filter((mod) => mod.type === 'Add' && mod.udfPath === udfPath)
        .map((mod) => mod.queryId);
    },
    /** Deliver one server `Transition` carrying the given query modifications. */
    transition(modifications: object[]) {
      const lastModify = [...sent].reverse().find((message) => message.type === 'ModifyQuerySet');
      const startVersion = {
        querySet: serverQuerySetVersion,
        ts: encodeTimestamp(serverTimestamp),
        identity: 0,
      };
      serverQuerySetVersion = lastModify ? (lastModify['newVersion'] as number) : serverQuerySetVersion;
      serverTimestamp += 1;
      const endVersion = {
        querySet: serverQuerySetVersion,
        ts: encodeTimestamp(serverTimestamp),
        identity: 0,
      };
      instances.at(-1)?.onmessage?.({
        data: JSON.stringify({ type: 'Transition', startVersion, endVersion, modifications }),
      });
    },
  };
}

// A structurally valid unsigned JWT: the real auth manager `jwtDecode`s the
// token to schedule a refresh, so it needs three base64url segments and a
// JSON payload with `iat`/`exp`.
function unsignedJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [encode({ alg: 'none', typ: 'JWT' }), encode({ iat: now, exp: now + 3600, sub: 'u' }), 'sig'].join('.');
}

// A string function reference is a legacy-but-legal FunctionReference: the
// real client's `getFunctionName` returns it unchanged, so the real
// registration path runs without needing a generated `api` object.
const paginatedQuery = 'todos:listTodosPaginated' as unknown as PaginatedQueryReference;

describe('convex-client-internals (real client contract)', () => {
  let client: ConvexClient;

  beforeEach(() => {
    client = new ConvexClient('https://test.convex.cloud', {
      webSocketConstructor: fakeWebSocketConstructor,
    });
  });

  afterEach(() => {
    void client.close();
  });

  it('setAuthWithRefresh forwards all three callbacks to BaseConvexClient.setAuth', () => {
    const setAuthSpy = jest.spyOn(client.client, 'setAuth');
    const fetchToken = jest.fn();
    const onChange = jest.fn();
    const onRefreshChange = jest.fn();

    setAuthWithRefresh(client, fetchToken, onChange, onRefreshChange);

    expect(setAuthSpy).toHaveBeenCalledWith(fetchToken, onChange, onRefreshChange);
  });

  it('hasAuth follows setAuth and clearAuth on the real client', async () => {
    expect(hasAuth(client)).toBe(false);

    setAuthWithRefresh(client, async () => unsignedJwt(), jest.fn(), jest.fn());
    // The token is fetched and decoded asynchronously; flush a few macrotasks.
    for (let i = 0; i < 3 && !hasAuth(client); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(hasAuth(client)).toBe(true);

    clearAuth(client);
    expect(hasAuth(client)).toBe(false);
  });

  it('localQueryResult returns undefined for an unknown query', () => {
    expect(localQueryResult(client, 'todos:list', {})).toBeUndefined();
  });

  it('exposes ConvexClient.onPaginatedUpdate_experimental', () => {
    expect(typeof client.onPaginatedUpdate_experimental).toBe('function');
  });

  it('subscribeToPaginatedQuery delivers the first-page payload and returns a working unsubscribe', async () => {
    const onUpdate = jest.fn();
    const onError = jest.fn();

    const unsubscribe = subscribeToPaginatedQuery(client, paginatedQuery, {}, 10, onUpdate, onError);

    // The real client replays the loading-first-page result one macrotask
    // after subscribing; that replay is the upstream contract pinned here.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [result] = onUpdate.mock.calls[0];
    expect(result).toEqual(expect.objectContaining({ results: [], status: 'LoadingFirstPage' }));
    expect(typeof result.loadMore).toBe('function');
    expect(onError).not.toHaveBeenCalled();

    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('paginationOptsId reads the numeric id the real client injects into each page query', () => {
    const socket = createDrivenWebSocket();
    const driven = new ConvexClient('https://test.convex.cloud', { webSocketConstructor: socket.webSocketConstructor });
    socket.open();
    const unsubscribe = subscribeToPaginatedQuery(driven, paginatedQuery, {}, 10, jest.fn(), jest.fn());

    // Page queries only appear in the optimistic-update store once the server
    // has answered them, so answer the first page with an empty result.
    const [pageQueryId] = socket.queryIdsFor('todos:listTodosPaginated');
    socket.transition([
      {
        type: 'QueryUpdated',
        queryId: pageQueryId,
        value: { page: [], isDone: false, continueCursor: 'cursor' },
        logLines: [],
        journal: null,
      },
    ]);

    // Observe the page query's real args through the public optimistic-update
    // API, the same route the library's paginated optimistic updates use.
    let observedArgs: unknown[] = [];
    void driven.client
      .mutation(
        'todos:noop',
        {},
        {
          optimisticUpdate: (store) => {
            observedArgs = store.getAllQueries(paginatedQuery).map((entry) => entry.args);
          },
        },
      )
      .catch(() => undefined);

    expect(observedArgs).toHaveLength(1);
    const { paginationOpts } = observedArgs[0] as { paginationOpts: PaginationOptions };
    // `ConvexClient` always injects -1 (simple_client.ts), so every subscription
    // through it shares one `insertAtPosition` group.
    expect(paginationOptsId(paginationOpts)).toBe(-1);

    unsubscribe();
    void driven.close();
  });

  it('replays a cached query error to a fresh listener as onError, never as a value', async () => {
    const socket = createDrivenWebSocket();
    const driven = new ConvexClient('https://test.convex.cloud', { webSocketConstructor: socket.webSocketConstructor });
    socket.open();
    const failingQuery = 'todos:failing' as unknown as FunctionReference<'query'>;

    const firstListener = jest.fn();
    const unsubscribeFirst = driven.onUpdate(failingQuery, {}, firstListener, jest.fn());
    const [queryId] = socket.queryIdsFor('todos:failing');
    socket.transition([
      { type: 'QueryFailed', queryId, errorMessage: 'boom', logLines: [], errorData: null, journal: null },
    ]);

    // The server reported the query as failed: the warm cache holds an error.
    expect(() => localQueryResult(driven, 'todos:failing', {})).toThrow('boom');

    // A fresh listener subscribing now has a result "ready", so the client
    // schedules a replay one macrotask later; the cached error must reach its
    // `onError` exactly once and its value callback never.
    const callback = jest.fn();
    const onError = jest.fn();
    const unsubscribeFresh = driven.onUpdate(failingQuery, {}, callback, onError);
    expect(onError).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toEqual(expect.objectContaining({ message: expect.stringContaining('boom') }));
    expect(callback).not.toHaveBeenCalled();
    expect(firstListener).not.toHaveBeenCalled();

    unsubscribeFresh();
    unsubscribeFirst();
    void driven.close();
  });

  describe('real-client behavior the MockConvexClient hides', () => {
    const pagePath = 'todos:listTodosPaginated';
    const plain = (path: string) => path as unknown as FunctionReference<'query'>;
    const emptyPage = { page: [], isDone: false, continueCursor: 'cursor' };
    const queryUpdated = (queryId: number, value: unknown) => ({
      type: 'QueryUpdated',
      queryId,
      value,
      logLines: [],
      journal: null,
    });
    const queryFailed = (queryId: number) => ({
      type: 'QueryFailed',
      queryId,
      errorMessage: 'boom',
      logLines: [],
      errorData: null,
      journal: null,
    });
    // ConvexClient also passes a reserved second argument; record only the value.
    const valuesOf = (listener: jest.Mock): unknown[] => listener.mock.calls.map(([value]: unknown[]) => value);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    let socket: ReturnType<typeof createDrivenWebSocket>;
    let driven: ConvexClient;

    beforeEach(() => {
      socket = createDrivenWebSocket();
      driven = new ConvexClient('https://test.convex.cloud', { webSocketConstructor: socket.webSocketConstructor });
      socket.open();
    });

    afterEach(() => {
      void driven.close();
    });

    describe('a failed page of a paginated query', () => {
      // Registers a plain listener, the paginated listener, then another plain
      // listener (in that order: the client notifies listeners in registration
      // order) and answers all three with healthy results.
      async function openAroundPaginated() {
        const before = jest.fn();
        const after = jest.fn();
        const onUpdate = jest.fn<void, [{ status: string }]>();
        const onError = jest.fn();
        driven.onUpdate(plain('todos:before'), {}, before, jest.fn());
        const unsubscribe = subscribeToPaginatedQuery(driven, paginatedQuery, {}, 10, onUpdate, onError);
        driven.onUpdate(plain('todos:after'), {}, after, jest.fn());
        // The client replays the loading-first-page result one macrotask after
        // subscribing; run it now so it cannot fire later, after the page failed.
        await tick();

        const [beforeId] = socket.queryIdsFor('todos:before');
        const [pageId] = socket.queryIdsFor(pagePath);
        const [afterId] = socket.queryIdsFor('todos:after');
        socket.transition([queryUpdated(beforeId, 1), queryUpdated(pageId, emptyPage), queryUpdated(afterId, 1)]);
        return { before, after, onUpdate, onError, unsubscribe, beforeId, pageId, afterId };
      }

      it('aborts the transition: onError is never called and listeners registered after it stop updating', async () => {
        const { before, after, onUpdate, onError, unsubscribe, beforeId, pageId, afterId } =
          await openAroundPaginated();
        expect(onUpdate.mock.calls.map(([result]) => result.status)).toEqual(['LoadingFirstPage', 'CanLoadMore']);

        // The client throws while computing the paginated result, out of the
        // WebSocket message handler, before any listener is notified.
        expect(() => socket.transition([queryFailed(pageId)])).toThrow('boom');
        expect(onError).not.toHaveBeenCalled();

        // Every later transition aborts at the paginated listener: listeners
        // registered before it are served, listeners registered after it are not.
        expect(() => socket.transition([queryUpdated(beforeId, 2), queryUpdated(afterId, 2)])).toThrow('boom');
        expect(valuesOf(before)).toEqual([1, 2]);
        expect(valuesOf(after)).toEqual([1]);
        expect(onError).not.toHaveBeenCalled();

        // Dropping the failed paginated subscription unblocks the client.
        unsubscribe();
        socket.transition([queryUpdated(afterId, 3)]);
        expect(valuesOf(after)).toEqual([1, 3]);
      });

      it('throws synchronously when the same query is subscribed again, which is what reset() does', async () => {
        const { unsubscribe, pageId } = await openAroundPaginated();
        expect(() => socket.transition([queryFailed(pageId)])).toThrow('boom');

        unsubscribe();
        const onUpdate = jest.fn();
        const onError = jest.fn();
        expect(() => subscribeToPaginatedQuery(driven, paginatedQuery, {}, 10, onUpdate, onError)).toThrow('boom');

        // The throw comes after the client already asked the server for the
        // page again, and neither callback hears about it.
        expect(socket.queryIdsFor(pagePath)).toHaveLength(2);
        expect(onError).not.toHaveBeenCalled();
        expect(onUpdate).not.toHaveBeenCalled();
      });

      it('recovers silently once the server answers the page the throwing resubscribe asked for', async () => {
        const { unsubscribe, pageId } = await openAroundPaginated();
        expect(() => socket.transition([queryFailed(pageId)])).toThrow('boom');

        unsubscribe();
        const onUpdate = jest.fn<void, [{ status: string }]>();
        const onError = jest.fn();
        expect(() => subscribeToPaginatedQuery(driven, paginatedQuery, {}, 10, onUpdate, onError)).toThrow('boom');

        // The listener was registered before the throw, so it still hears the
        // server's answer to the second page query; but the caller never got its
        // unsubscribe handle and `onError` never reported the failure.
        const [, secondPageId] = socket.queryIdsFor(pagePath);
        expect(secondPageId).toBeDefined();
        expect(() => socket.transition([queryUpdated(secondPageId, emptyPage)])).not.toThrow();
        expect(onUpdate.mock.calls.map(([result]) => result.status)).toEqual(['CanLoadMore']);
        expect(onError).not.toHaveBeenCalled();
      });
    });

    describe('unsubscribe then subscribe in the same tick, as refetch() does', () => {
      const failing = plain('todos:failing');
      const modifyCount = () => socket.sent.filter((message) => message.type === 'ModifyQuerySet').length;

      it('replays the cached error to the new listener before the server answers, then settles on the fresh result', async () => {
        const unsubscribeFirst = driven.onUpdate(failing, {}, jest.fn(), jest.fn());
        const [firstId] = socket.queryIdsFor('todos:failing');
        socket.transition([queryFailed(firstId)]);

        unsubscribeFirst();
        const onValue = jest.fn();
        const onError = jest.fn();
        driven.onUpdate(failing, {}, onValue, onError);

        // The only subscriber went away, so the server is asked again (a Remove
        // then an Add with a new query id) ...
        const [, secondId] = socket.queryIdsFor('todos:failing');
        expect(secondId).toBeDefined();
        expect(onError).not.toHaveBeenCalled();

        // ... but before it answers, the client replays the stale cached error.
        await tick();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toEqual(expect.objectContaining({ message: expect.stringContaining('boom') }));
        expect(onValue).not.toHaveBeenCalled();

        socket.transition([queryUpdated(secondId, 'recovered')]);
        expect(valuesOf(onValue)).toEqual(['recovered']);
        expect(onError).toHaveBeenCalledTimes(1);
      });

      it('replays the cached error without contacting the server when another subscriber holds the query', async () => {
        const unsubscribeFirst = driven.onUpdate(failing, {}, jest.fn(), jest.fn());
        const otherOnError = jest.fn();
        driven.onUpdate(failing, {}, jest.fn(), otherOnError);
        const [queryId] = socket.queryIdsFor('todos:failing');
        socket.transition([queryFailed(queryId)]);
        expect(otherOnError).toHaveBeenCalledTimes(1);
        const modifiesBefore = modifyCount();

        unsubscribeFirst();
        const onError = jest.fn();
        driven.onUpdate(failing, {}, jest.fn(), onError);

        // Only a subscriber count changed: no Remove, no Add, so the server
        // never re-runs the query.
        expect(modifyCount()).toBe(modifiesBefore);
        expect(socket.queryIdsFor('todos:failing')).toHaveLength(1);

        await tick();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toEqual(expect.objectContaining({ message: expect.stringContaining('boom') }));
        // The existing subscriber is not told again.
        expect(otherOnError).toHaveBeenCalledTimes(1);
      });

      it('replays the previous value of a healthy query before the server answers', async () => {
        const healthy = plain('todos:list');
        const unsubscribeFirst = driven.onUpdate(healthy, {}, jest.fn(), jest.fn());
        const [firstId] = socket.queryIdsFor('todos:list');
        socket.transition([queryUpdated(firstId, 'old')]);

        unsubscribeFirst();
        const onValue = jest.fn();
        driven.onUpdate(healthy, {}, onValue, jest.fn());
        const [, secondId] = socket.queryIdsFor('todos:list');
        expect(secondId).toBeDefined();

        // No server message has arrived, yet the listener already has a value.
        await tick();
        expect(valuesOf(onValue)).toEqual(['old']);

        socket.transition([queryUpdated(secondId, 'new')]);
        expect(valuesOf(onValue)).toEqual(['old', 'new']);
      });
    });
  });

  it('PaginationStatus members match the four expected literals exactly', () => {
    const check: PaginationStatus[] = ['LoadingFirstPage', 'CanLoadMore', 'LoadingMore', 'Exhausted'];
    expect(check).toHaveLength(4);

    // The reverse direction: a new upstream PaginationStatus member fails
    // this assignment to compile, so a fifth status can't pass silently.
    const allStatuses: Record<PaginationStatus, true> = {
      LoadingFirstPage: true,
      CanLoadMore: true,
      LoadingMore: true,
      Exhausted: true,
    };
    expect(Object.keys(allStatuses)).toHaveLength(4);
  });

  it('DISABLED_CONNECTION_STATE keys are a subset of the real connectionState() keys', () => {
    const realState = client.connectionState();
    expect(Object.keys(DISABLED_CONNECTION_STATE).every((key) => key in realState)).toBe(true);
  });

  describe('on a disabled client', () => {
    let disabled: ConvexClient;

    beforeEach(() => {
      disabled = new ConvexClient('https://test.convex.cloud', { disabled: true });
    });

    afterEach(() => {
      void disabled.close();
    });

    it('throws from the low-level client getter, which is why the wrappers guard it', () => {
      expect(() => disabled.client).toThrow('ConvexClient is disabled');
    });

    it('turns every low-level wrapper into a no-op', () => {
      expect(() => setAuthWithRefresh(disabled, jest.fn(), jest.fn(), jest.fn())).not.toThrow();
      expect(hasAuth(disabled)).toBe(false);
      expect(() => clearAuth(disabled)).not.toThrow();
      expect(localQueryResult(disabled, 'todos:list', {})).toBeUndefined();
    });
  });
});
