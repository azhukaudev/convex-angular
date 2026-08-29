import { ConvexClient, PaginationStatus } from 'convex/browser';
import { PaginationOptions } from 'convex/server';

import type { PaginatedQueryReference } from '../providers/inject-paginated-query';
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

  it('exposes BaseConvexClient.setAuth and forwards onRefreshChange without throwing', () => {
    expect(typeof client.client.setAuth).toBe('function');

    const fetchToken = jest.fn();
    const onChange = jest.fn();
    const onRefreshChange = jest.fn();

    expect(() => setAuthWithRefresh(client, fetchToken, onChange, onRefreshChange)).not.toThrow();
  });

  it('exposes BaseConvexClient.hasAuth/clearAuth, with hasAuth false initially', () => {
    expect(typeof client.client.hasAuth).toBe('function');
    expect(typeof client.client.clearAuth).toBe('function');
    expect(hasAuth(client)).toBe(false);
    expect(() => clearAuth(client)).not.toThrow();
  });

  it('localQueryResult returns undefined for an unknown query', () => {
    expect(localQueryResult(client, 'todos:list', {})).toBeUndefined();
  });

  it('exposes ConvexClient.onPaginatedUpdate_experimental', () => {
    expect(typeof client.onPaginatedUpdate_experimental).toBe('function');
  });

  it('subscribeToPaginatedQuery registers a real subscription and returns a working unsubscribe', () => {
    // A string function reference is a legacy-but-legal FunctionReference: the
    // real client's `getFunctionName` returns it unchanged, so this exercises
    // the feature probe and the real `onPaginatedUpdate_experimental`
    // registration path without needing a generated `api` object.
    const query = 'todos:listTodosPaginated' as unknown as PaginatedQueryReference;
    const onUpdate = jest.fn();
    const onError = jest.fn();

    let unsubscribe!: () => void;
    expect(() => {
      unsubscribe = subscribeToPaginatedQuery(client, query, {}, 10, onUpdate, onError);
    }).not.toThrow();

    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('paginationOptsId reads the client-injected `id` field', () => {
    // `id` is not part of the documented PaginationOptions type — it is
    // injected by the client at runtime — hence the cast.
    const paginationOpts = { numItems: 10, cursor: null, id: 'the-id' } as unknown as PaginationOptions;

    expect(paginationOptsId(paginationOpts)).toBe('the-id');
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
});
