import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  injectConvex,
  injectConvexConnectionState,
  injectMutation,
  injectQuery,
  type MutationReference,
  type QueryReference,
} from 'convex-angular';
import { ConnectionState } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import {
  MockAuthRegistration,
  MockConvexClient,
  MockPaginatedSubscription,
  MockQuerySubscription,
  provideConvexTesting,
} from './mock-convex-client';

function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

function requireLastAuthRegistration(convex: MockConvexClient): MockAuthRegistration {
  const registration = convex.lastAuthRegistration();
  if (!registration) {
    throw new Error('Expected a captured auth registration');
  }
  return registration;
}

function requireLastPaginatedSubscription(convex: MockConvexClient): MockPaginatedSubscription {
  const subscription = convex.lastPaginatedSubscription();
  if (!subscription) {
    throw new Error('Expected a captured paginated subscription');
  }
  return subscription;
}

/**
 * Seeds every args/marker pair under the same query name, then reads each one
 * back. A warm-cache key that fails to tell two of these arg shapes apart lets
 * a later seed overwrite an earlier one, so at least one marker comes back wrong.
 */
function expectDistinctWarmCacheEntries(
  convex: MockConvexClient,
  seeds: ReadonlyArray<readonly [Record<string, unknown>, string]>,
): void {
  for (const [args, marker] of seeds) {
    convex.seedQueryResult('todos:list', args, marker);
  }
  for (const [args, marker] of seeds) {
    expect(convex.client.localQueryResult('todos:list', args)).toBe(marker);
  }
}

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:list'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  Array<{ _id: string; title: string }>
> as QueryReference;

const mockMutation = (() => {}) as unknown as FunctionReference<
  'mutation',
  'public',
  { title: string },
  string
> as MutationReference;

describe('MockConvexClient with real library helpers', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex)],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('drives injectQuery through subscription capture and emit', fakeAsync(() => {
    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({}));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.todos.status()).toBe('pending');
    expect(convex.querySubscriptions).toHaveLength(1);
    expect(requireLastQuerySubscription(convex).args).toEqual({});

    requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Mocked todo' }]);

    expect(fixture.componentInstance.todos.status()).toBe('success');
    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: '1', title: 'Mocked todo' }]);

    fixture.destroy();
    expect(requireLastQuerySubscription(convex).unsubscribed).toBe(true);
  }));

  it('surfaces emitted errors through injectQuery', fakeAsync(() => {
    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({}));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const queryError = new Error('boom');
    requireLastQuerySubscription(convex).emitError(queryError);

    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(fixture.componentInstance.todos.error()).toBe(queryError);
  }));

  it('matches seeded results regardless of args property order', () => {
    convex.seedQueryResult('todos:list', { b: 2, a: 1 }, 'seeded');

    expect(convex.client.localQueryResult('todos:list', { a: 1, b: 2 })).toBe('seeded');
  });

  it('serves seeded warm-cache results before any emission', fakeAsync(() => {
    convex.seedQueryResult('todos:list', {}, [{ _id: 'warm', title: 'Warm' }]);

    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({}));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'warm', title: 'Warm' }]);
  }));

  it('captures mutations as settleable calls', fakeAsync(() => {
    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly addTodo = injectMutation(mockMutation);
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    let resolved: unknown;
    void fixture.componentInstance.addTodo.mutate({ title: 'New' }).then((value) => (resolved = value));
    tick();

    expect(fixture.componentInstance.addTodo.status()).toBe('pending');
    expect(convex.mutationCalls).toHaveLength(1);
    expect(convex.mutationCalls[0].args).toEqual({ title: 'New' });

    convex.mutationCalls[0].resolve('todo-id');
    tick();

    expect(resolved).toBe('todo-id');
    expect(fixture.componentInstance.addTodo.status()).toBe('success');
    expect(fixture.componentInstance.addTodo.data()).toBe('todo-id');
  }));

  it('pushes connection state changes to injectConvexConnectionState', fakeAsync(() => {
    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly connection = injectConvexConnectionState();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.connection().isWebSocketConnected).toBe(true);

    convex.setConnectionState({ isWebSocketConnected: false });

    expect(fixture.componentInstance.connection().isWebSocketConnected).toBe(false);
  }));

  it('mirrors the disabled client (SSR) contract', fakeAsync(() => {
    TestBed.resetTestingModule();
    const disabledConvex = new MockConvexClient({ disabled: true });
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(disabledConvex)],
    });

    @Component({ template: '', standalone: true })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({}));
      readonly connection = injectConvexConnectionState();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // No subscription is made, the helper stays pending, and the
    // connection state reports the static disconnected default.
    expect(disabledConvex.querySubscriptions).toHaveLength(0);
    expect(fixture.componentInstance.todos.status()).toBe('pending');
    expect(fixture.componentInstance.connection().isWebSocketConnected).toBe(false);
    expect(() => disabledConvex.client).toThrow('ConvexClient is disabled');
  }));

  describe('unsubscribe fidelity', () => {
    it('stops delivering query results after unsubscribe, like the real client', () => {
      const onUpdate = jest.fn();
      const unsubscribe = convex.onUpdate(mockQuery, {}, onUpdate);

      unsubscribe();
      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(onUpdate).not.toHaveBeenCalled();
      expect(requireLastQuerySubscription(convex).unsubscribed).toBe(true);
    });

    it('stops delivering query errors after unsubscribe, like the real client', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const unsubscribe = convex.onUpdate(mockQuery, {}, onUpdate, onError);

      unsubscribe();
      requireLastQuerySubscription(convex).emitError(new Error('boom'));

      expect(onError).not.toHaveBeenCalled();
    });

    it('stops delivering paginated results after unsubscribe, like the real client', () => {
      const onUpdate = jest.fn();
      const unsubscribe = convex.onPaginatedUpdate_experimental(mockQuery, {}, { initialNumItems: 10 }, onUpdate);

      unsubscribe();
      requireLastPaginatedSubscription(convex).emit({ results: [], status: 'Exhausted', loadMore: () => false });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(requireLastPaginatedSubscription(convex).unsubscribed).toBe(true);
    });

    it('stops delivering paginated errors after unsubscribe, like the real client', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();
      const unsubscribe = convex.onPaginatedUpdate_experimental(
        mockQuery,
        {},
        { initialNumItems: 10 },
        onUpdate,
        onError,
      );

      unsubscribe();
      requireLastPaginatedSubscription(convex).emitError(new Error('boom'));

      expect(onError).not.toHaveBeenCalled();
    });

    it('still delivers results before unsubscribe (guards against over-gating)', () => {
      const onUpdate = jest.fn();
      const unsubscribe = convex.onUpdate(mockQuery, {}, onUpdate);

      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(onUpdate).toHaveBeenCalledWith([{ _id: '1', title: 'Todo' }]);
      unsubscribe();
    });
  });
});

describe('MockConvexClient contract', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
  });

  describe('warm-cache keys', () => {
    it('tells args apart by key and by value', () => {
      expectDistinctWarmCacheEntries(convex, [
        [{}, 'no-args'],
        [{ a: 1 }, 'a-is-one'],
        [{ a: 2 }, 'a-is-two'],
        [{ b: 1 }, 'b-is-one'],
        [{ a: 1, b: 2 }, 'a-and-b'],
      ]);
    });

    it('tells arrays apart by length and by element', () => {
      expectDistinctWarmCacheEntries(convex, [
        [{ ids: [] }, 'no-ids'],
        [{ ids: [1] }, 'one-id'],
        [{ ids: [2] }, 'other-id'],
        [{ ids: [1, 2] }, 'two-ids'],
        [{ ids: [12] }, 'one-big-id'],
      ]);
    });

    it('tells an array apart from an object with the same numeric keys', () => {
      expectDistinctWarmCacheEntries(convex, [
        [{ value: [] }, 'empty-array'],
        [{ value: {} }, 'empty-object'],
        [{ value: [1, 2] }, 'array'],
        [{ value: { 0: 1, 1: 2 } }, 'numeric-keyed-object'],
      ]);
    });

    it('tells a null value apart from an object value', () => {
      expectDistinctWarmCacheEntries(convex, [
        [{ value: null }, 'null-value'],
        [{ value: {} }, 'object-value'],
      ]);
    });

    it('returns undefined for args that were never seeded', () => {
      convex.seedQueryResult('todos:list', { a: 1 }, 'seeded');

      expect(convex.client.localQueryResult('todos:list', { a: 2 })).toBeUndefined();
      expect(convex.client.localQueryResult('todos:other', { a: 1 })).toBeUndefined();
    });
  });

  describe('client auth surface', () => {
    const fetchToken = async () => 'token';

    it('starts unauthenticated with nothing registered', () => {
      expect(convex.client.hasAuth()).toBe(false);
      expect(convex.getAuth()).toBeUndefined();
      expect(convex.authRegistrations).toHaveLength(0);
      expect(convex.lastAuthRegistration()).toBeUndefined();
      expect(convex.clearAuthCount).toBe(0);
    });

    it('captures the token fetcher a setAuth caller registers', async () => {
      convex.client.setAuth(fetchToken);

      const registration = requireLastAuthRegistration(convex);
      expect(convex.authRegistrations).toHaveLength(1);
      expect(registration.cleared).toBe(false);
      await expect(registration.fetchToken({ forceRefreshToken: false })).resolves.toBe('token');
    });

    it('reports no authentication from registration alone', () => {
      convex.client.setAuth(fetchToken);

      // Registration is configuration; the real hasAuth() reports a held token.
      expect(convex.client.hasAuth()).toBe(false);
    });

    it('reports authentication once the client holds a token', () => {
      convex.seedAuth({ token: 'jwt', decoded: {} });

      expect(convex.client.hasAuth()).toBe(true);
    });

    it('forwards the authentication outcome to the registered callback', () => {
      const changes: boolean[] = [];
      convex.client.setAuth(fetchToken, (isAuthenticated) => changes.push(isAuthenticated));

      requireLastAuthRegistration(convex).setAuthenticated(true);

      expect(changes).toEqual([true]);
    });

    it('forwards refresh transitions to the registered callback', () => {
      const refreshes: boolean[] = [];
      convex.client.setAuth(
        fetchToken,
        () => undefined,
        (isRefreshing) => refreshes.push(isRefreshing),
      );

      const registration = requireLastAuthRegistration(convex);
      registration.setRefreshing(true);
      registration.setRefreshing(false);

      expect(refreshes).toEqual([true, false]);
    });

    it('tolerates a registration made without optional callbacks', () => {
      convex.client.setAuth(fetchToken);

      const registration = requireLastAuthRegistration(convex);

      expect(() => {
        registration.setAuthenticated(true);
        registration.setRefreshing(true);
      }).not.toThrow();
    });

    it('keeps calling back after clearAuth, like the real client', () => {
      const changes: boolean[] = [];
      convex.client.setAuth(fetchToken, (isAuthenticated) => changes.push(isAuthenticated));
      const registration = requireLastAuthRegistration(convex);

      convex.client.clearAuth();
      registration.setAuthenticated(true);

      // clearAuth drops the token; it does not tear down the registered config,
      // so a late callback still arrives and the helper must cope.
      expect(registration.cleared).toBe(true);
      expect(changes).toEqual([true]);
    });

    it('drops the held token and counts the call on clearAuth', () => {
      convex.seedAuth({ token: 'jwt', decoded: {} });

      convex.client.clearAuth();

      expect(convex.client.hasAuth()).toBe(false);
      expect(convex.getAuth()).toBeUndefined();
      expect(convex.clearAuthCount).toBe(1);
    });

    it('keeps every registration in order across re-registration', () => {
      convex.client.setAuth(fetchToken);
      convex.client.clearAuth();
      convex.client.setAuth(fetchToken);

      expect(convex.authRegistrations).toHaveLength(2);
      expect(convex.authRegistrations[0].cleared).toBe(true);
      expect(requireLastAuthRegistration(convex).cleared).toBe(false);
    });

    it('lets a test stand in for an already-authenticated client', () => {
      convex.seedAuth({ token: 'jwt', decoded: {} });

      expect(convex.client.hasAuth()).toBe(true);
      expect(convex.authRegistrations).toHaveLength(0);
    });

    it('reports no auth state at all when disabled', () => {
      const disabled = new MockConvexClient({ disabled: true });
      disabled.seedAuth({ token: 'jwt', decoded: {} });

      expect(disabled.getAuth()).toBeUndefined();
    });

    it('reports the seeded token and claims through getAuth', () => {
      convex.seedAuth({ token: 'jwt', decoded: { sub: 'user_1' } });

      expect(convex.getAuth()).toEqual({ token: 'jwt', decoded: { sub: 'user_1' } });
    });

    it('clears a seeded token when seeded with undefined', () => {
      convex.seedAuth({ token: 'jwt', decoded: {} });

      convex.seedAuth(undefined);

      expect(convex.getAuth()).toBeUndefined();
    });
  });

  describe('connection state', () => {
    it('starts from a connected, idle state', () => {
      expect(convex.connectionState()).toEqual({
        hasInflightRequests: false,
        isWebSocketConnected: true,
        timeOfOldestInflightRequest: null,
        hasEverConnected: true,
        connectionCount: 1,
        connectionRetries: 0,
        inflightMutations: 0,
        inflightActions: 0,
      });
    });

    it('merges a partial update into the current state and pushes it to listeners', () => {
      const pushed: ConnectionState[] = [];
      convex.subscribeToConnectionState((state) => pushed.push(state));

      convex.setConnectionState({ isWebSocketConnected: false, connectionRetries: 3 });

      expect(pushed).toHaveLength(1);
      expect(pushed[0].isWebSocketConnected).toBe(false);
      expect(pushed[0].connectionRetries).toBe(3);
      // Fields absent from the partial keep their previous value.
      expect(pushed[0].hasEverConnected).toBe(true);
      expect(pushed[0].connectionCount).toBe(1);
      expect(convex.connectionState().isWebSocketConnected).toBe(false);
    });

    it('stops pushing to a listener once its unsubscribe is called', () => {
      const pushed: ConnectionState[] = [];
      const unsubscribe = convex.subscribeToConnectionState((state) => pushed.push(state));

      unsubscribe();
      convex.setConnectionState({ isWebSocketConnected: false });

      expect(pushed).toHaveLength(0);
      // The state itself still changed; only the delivery stopped.
      expect(convex.connectionState().isWebSocketConnected).toBe(false);
    });

    it('keeps other listeners subscribed when one unsubscribes', () => {
      const stillSubscribed: ConnectionState[] = [];
      const unsubscribe = convex.subscribeToConnectionState(() => undefined);
      convex.subscribeToConnectionState((state) => stillSubscribed.push(state));

      unsubscribe();
      convex.setConnectionState({ isWebSocketConnected: false });

      expect(stillSubscribed).toHaveLength(1);
    });
  });

  describe('paginated subscriptions', () => {
    it('captures the query, args and page size, and starts subscribed', () => {
      convex.onPaginatedUpdate_experimental(mockQuery, { filter: 'open' }, { initialNumItems: 25 }, () => undefined);

      const subscription = requireLastPaginatedSubscription(convex);
      expect(convex.paginatedSubscriptions).toHaveLength(1);
      expect(subscription.query).toBe(mockQuery);
      expect(subscription.args).toEqual({ filter: 'open' });
      expect(subscription.initialNumItems).toBe(25);
      expect(subscription.unsubscribed).toBe(false);
    });

    it('delivers an emitted page to the subscriber', () => {
      const received: unknown[] = [];
      convex.onPaginatedUpdate_experimental(mockQuery, {}, { initialNumItems: 10 }, (result) => received.push(result));

      const page = { results: [{ _id: '1', title: 'Todo' }], status: 'CanLoadMore', loadMore: () => true };
      requireLastPaginatedSubscription(convex).emit(page);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(page);
    });

    it('delivers an emitted error to the subscriber', () => {
      const received: Error[] = [];
      convex.onPaginatedUpdate_experimental(
        mockQuery,
        {},
        { initialNumItems: 10 },
        () => undefined,
        (err) => received.push(err),
      );

      const failure = new Error('boom');
      requireLastPaginatedSubscription(convex).emitError(failure);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(failure);
    });
  });

  describe('disabled client', () => {
    let disabled: MockConvexClient;

    beforeEach(() => {
      disabled = new MockConvexClient({ disabled: true });
    });

    it('throws from connectionState', () => {
      expect(() => disabled.connectionState()).toThrow(Error);
      expect(() => disabled.connectionState()).toThrow(/disabled/);
    });

    it('throws from the client getter', () => {
      expect(() => disabled.client).toThrow(/disabled/);
    });

    it('captures no query subscription and hands back a callable no-op', () => {
      const received: unknown[] = [];
      const unsubscribe = disabled.onUpdate(mockQuery, {}, (result) => received.push(result));

      expect(disabled.querySubscriptions).toHaveLength(0);
      expect(disabled.lastQuerySubscription()).toBeUndefined();
      expect(() => unsubscribe()).not.toThrow();
      expect(received).toHaveLength(0);
    });

    it('captures no paginated subscription and hands back a callable no-op', () => {
      const received: unknown[] = [];
      const unsubscribe = disabled.onPaginatedUpdate_experimental(mockQuery, {}, { initialNumItems: 10 }, (result) =>
        received.push(result),
      );

      expect(disabled.paginatedSubscriptions).toHaveLength(0);
      expect(disabled.lastPaginatedSubscription()).toBeUndefined();
      expect(() => unsubscribe()).not.toThrow();
      expect(received).toHaveLength(0);
    });

    it('still reports itself as disabled', () => {
      expect(disabled.disabled).toBe(true);
      expect(new MockConvexClient().disabled).toBe(false);
      expect(new MockConvexClient({}).disabled).toBe(false);
    });

    it('registers no connection-state listener and hands back a callable no-op', () => {
      const received: ConnectionState[] = [];
      const unsubscribe = disabled.subscribeToConnectionState((state) => received.push(state));

      disabled.setConnectionState({ isWebSocketConnected: false });

      expect(received).toHaveLength(0);
      expect(() => unsubscribe()).not.toThrow();
    });

    it('still records the connection-state calls it refuses to honour', () => {
      disabled.subscribeToConnectionState(() => undefined);
      expect(() => disabled.connectionState()).toThrow(/disabled/);

      // Recorded rather than dropped, so `toBe(0)` elsewhere proves the caller
      // never reached for these rather than proving nothing.
      expect(disabled.connectionStateSubscriptions).toBe(1);
      expect(disabled.connectionStateReads).toBe(1);
    });

    it('records a refused query subscription instead of dropping it silently', () => {
      disabled.onUpdate(mockQuery, { count: 10 }, () => undefined);

      expect(disabled.querySubscriptions).toHaveLength(0);
      expect(disabled.refusedSubscriptions).toEqual([{ kind: 'query', query: mockQuery, args: { count: 10 } }]);
    });

    it('records a refused paginated subscription instead of dropping it silently', () => {
      disabled.onPaginatedUpdate_experimental(mockQuery, { q: 'a' }, { initialNumItems: 10 }, () => undefined);

      expect(disabled.paginatedSubscriptions).toHaveLength(0);
      expect(disabled.refusedSubscriptions).toEqual([{ kind: 'paginated', query: mockQuery, args: { q: 'a' } }]);
    });

    it('refuses nothing when the client is enabled', () => {
      const enabled = new MockConvexClient();

      enabled.onUpdate(mockQuery, {}, () => undefined);
      enabled.onPaginatedUpdate_experimental(mockQuery, {}, { initialNumItems: 10 }, () => undefined);

      expect(enabled.refusedSubscriptions).toHaveLength(0);
    });
  });

  describe('retired-callback fault injection', () => {
    it('invokes a retired query callback the real client would never call', () => {
      const received: unknown[] = [];
      const unsubscribe = convex.onUpdate(mockQuery, {}, (result) => received.push(result));
      const subscription = requireLastQuerySubscription(convex);

      unsubscribe();
      subscription.emit('gated');
      subscription.emitAfterUnsubscribe('retired');

      expect(received).toEqual(['retired']);
    });

    it('invokes a retired query error callback', () => {
      const received: Error[] = [];
      const unsubscribe = convex.onUpdate(
        mockQuery,
        {},
        () => undefined,
        (err) => received.push(err),
      );
      const subscription = requireLastQuerySubscription(convex);
      const failure = new Error('boom');

      unsubscribe();
      subscription.emitError(new Error('gated'));
      subscription.emitErrorAfterUnsubscribe(failure);

      expect(received).toEqual([failure]);
    });

    it('invokes a retired paginated callback', () => {
      const received: unknown[] = [];
      const unsubscribe = convex.onPaginatedUpdate_experimental(mockQuery, {}, { initialNumItems: 10 }, (result) =>
        received.push(result),
      );
      const subscription = requireLastPaginatedSubscription(convex);
      const page = { results: ['a'], status: 'CanLoadMore', loadMore: () => true };

      unsubscribe();
      subscription.emitAfterUnsubscribe(page);

      expect(received).toEqual([page]);
    });

    it('invokes a retired paginated error callback', () => {
      const received: Error[] = [];
      const unsubscribe = convex.onPaginatedUpdate_experimental(
        mockQuery,
        {},
        { initialNumItems: 10 },
        () => undefined,
        (err) => received.push(err),
      );
      const subscription = requireLastPaginatedSubscription(convex);
      const failure = new Error('boom');

      unsubscribe();
      subscription.emitErrorAfterUnsubscribe(failure);

      expect(received).toEqual([failure]);
    });

    it('leaves the unsubscribe record untouched', () => {
      const unsubscribe = convex.onUpdate(mockQuery, {}, () => undefined);
      const subscription = requireLastQuerySubscription(convex);

      unsubscribe();
      subscription.emitAfterUnsubscribe('retired');

      expect(subscription.unsubscribed).toBe(true);
      expect(subscription.unsubscribeCount).toBe(1);
    });

    it('tolerates a retired error callback that was never registered', () => {
      convex.onUpdate(mockQuery, {}, () => undefined);

      expect(() => requireLastQuerySubscription(convex).emitErrorAfterUnsubscribe(new Error('boom'))).not.toThrow();
    });
  });

  describe('callable options', () => {
    it('records the options a mutation caller passes alongside its args', () => {
      const optimisticUpdate = () => undefined;

      void convex.mutation(mockMutation, { title: 'Todo' }, { optimisticUpdate });

      expect(convex.mutationCalls).toHaveLength(1);
      expect(convex.mutationCalls[0].args).toEqual({ title: 'Todo' });
      expect(convex.mutationCalls[0].options).toEqual({ optimisticUpdate });
    });

    it('records undefined options when the caller passes none', () => {
      void convex.mutation(mockMutation, {});
      void convex.action(mockMutation, {});

      expect(convex.mutationCalls[0].options).toBeUndefined();
      expect(convex.actionCalls[0].options).toBeUndefined();
    });

    it('records an action call with its args', () => {
      void convex.action(mockMutation, { title: 'Todo' });

      expect(convex.actionCalls).toHaveLength(1);
      expect(convex.actionCalls[0].args).toEqual({ title: 'Todo' });
    });
  });

  describe('one-shot query', () => {
    it('resolves a seeded warm-cache result', async () => {
      convex.seedQueryResult('todos:list', { count: 1 }, ['todo']);

      await expect(convex.query(mockQuery, { count: 1 })).resolves.toEqual(['todo']);
    });

    it('serves a warm-cache hit without opening a subscription', async () => {
      convex.seedQueryResult('todos:list', { count: 1 }, ['todo']);

      await convex.query(mockQuery, { count: 1 });

      expect(convex.querySubscriptions).toHaveLength(0);
    });

    it('subscribes and stays pending on a cache miss, like the real client', async () => {
      let settled = false;
      const pending = convex.query(mockQuery, { count: 1 }).then((result) => {
        settled = true;
        return result;
      });

      expect(convex.querySubscriptions).toHaveLength(1);
      expect(settled).toBe(false);

      requireLastQuerySubscription(convex).emit(['todo']);

      await expect(pending).resolves.toEqual(['todo']);
    });

    it('unsubscribes exactly once when a cache miss settles', async () => {
      const pending = convex.query(mockQuery, { count: 1 });
      const subscription = requireLastQuerySubscription(convex);

      subscription.emit(['todo']);
      await pending;

      expect(subscription.unsubscribeCount).toBe(1);
    });

    it('rejects and unsubscribes when a cache miss errors', async () => {
      const pending = convex.query(mockQuery, { count: 1 });
      const subscription = requireLastQuerySubscription(convex);
      const failure = new Error('boom');

      subscription.emitError(failure);

      await expect(pending).rejects.toBe(failure);
      expect(subscription.unsubscribeCount).toBe(1);
    });

    it('records the warm-cache lookup it makes first', async () => {
      convex.seedQueryResult('todos:list', { count: 1 }, ['todo']);

      await convex.query(mockQuery, { count: 1 });

      expect(convex.localQueryResultCalls).toEqual([{ queryName: 'todos:list', args: { count: 1 } }]);
    });

    it('rejects when the client is disabled', async () => {
      await expect(new MockConvexClient({ disabled: true }).query(mockQuery, {})).rejects.toThrow(/disabled/);
    });
  });

  describe('call records', () => {
    it('counts each unsubscribe of a query subscription', () => {
      const unsubscribe = convex.onUpdate(mockQuery, {}, () => undefined);
      const subscription = requireLastQuerySubscription(convex);

      expect(subscription.unsubscribeCount).toBe(0);

      unsubscribe();

      expect(subscription.unsubscribeCount).toBe(1);
      expect(subscription.unsubscribed).toBe(true);
    });

    it('counts each unsubscribe of a paginated subscription', () => {
      const unsubscribe = convex.onPaginatedUpdate_experimental(
        mockQuery,
        {},
        { initialNumItems: 10 },
        () => undefined,
      );
      const subscription = requireLastPaginatedSubscription(convex);

      unsubscribe();

      expect(subscription.unsubscribeCount).toBe(1);
      expect(subscription.unsubscribed).toBe(true);
    });

    it('records every warm-cache lookup in order, hit or miss', () => {
      convex.seedQueryResult('todos:list', { count: 1 }, ['todo']);

      convex.client.localQueryResult('todos:list', { count: 1 });
      convex.client.localQueryResult('todos:list', { count: 2 });

      expect(convex.localQueryResultCalls).toEqual([
        { queryName: 'todos:list', args: { count: 1 } },
        { queryName: 'todos:list', args: { count: 2 } },
      ]);
    });

    it('counts connection-state reads and subscriptions', () => {
      convex.connectionState();
      convex.connectionState();
      const unsubscribe = convex.subscribeToConnectionState(() => undefined);

      expect(convex.connectionStateReads).toBe(2);
      expect(convex.connectionStateSubscriptions).toBe(1);

      // Unsubscribing detaches the listener but does not rewrite the history.
      unsubscribe();
      expect(convex.connectionStateSubscriptions).toBe(1);
    });
  });

  describe('provideConvexTesting', () => {
    afterEach(() => {
      TestBed.resetTestingModule();
    });

    it('registers the supplied instance as the injected Convex client', () => {
      TestBed.configureTestingModule({ providers: [provideConvexTesting(convex)] });

      @Component({ template: '', standalone: true })
      class TestComponent {
        readonly client = injectConvex();
      }

      const fixture = TestBed.createComponent(TestComponent);

      expect(fixture.componentInstance.client).toBe(convex);
    });

    it('defaults to a fresh mock when none is supplied', () => {
      TestBed.configureTestingModule({ providers: [provideConvexTesting()] });

      @Component({ template: '', standalone: true })
      class TestComponent {
        readonly client = injectConvex();
      }

      const fixture = TestBed.createComponent(TestComponent);

      expect(fixture.componentInstance.client).toBeInstanceOf(MockConvexClient);
      expect(fixture.componentInstance.client).not.toBe(convex);
    });
  });
});
