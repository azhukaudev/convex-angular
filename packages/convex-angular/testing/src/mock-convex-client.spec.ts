import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  injectConvexConnectionState,
  injectMutation,
  injectQuery,
  type MutationReference,
  type QueryReference,
} from 'convex-angular';
import { FunctionReference } from 'convex/server';

import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from './mock-convex-client';

function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
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
});
