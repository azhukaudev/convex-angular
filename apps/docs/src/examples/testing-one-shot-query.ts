import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { injectConvex } from 'convex-angular';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';

import { api, type Todo, type TodoId } from './convex/api';

@Injectable({ providedIn: 'root' })
export class TodoCounter {
  private readonly convex = injectConvex();

  /** A one-shot read, outside any subscription. */
  async count(): Promise<number> {
    const todos = await this.convex.query(api.todos.list, { count: 20 });
    return todos.length;
  }
}

/** Narrows away the `undefined` the capture arrays return when nothing matched. */
function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

function todo(id: string, title: string): Todo {
  return { _id: id as TodoId, _creationTime: 0, title, description: '', completed: false, priority: 0 };
}

describe('TodoCounter', () => {
  let convex: MockConvexClient;
  let service: TodoCounter;

  beforeEach(() => {
    convex = new MockConvexClient();
    TestBed.configureTestingModule({ providers: [provideConvexTesting(convex)] });
    service = TestBed.inject(TodoCounter);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('serves a warm-cache hit without opening a subscription', async () => {
    convex.seedQueryResult('todos:list', { count: 20 }, [todo('1', 'Write docs')]);

    await expect(service.count()).resolves.toBe(1);

    // A hit settles straight from the cache — nothing was subscribed.
    expect(convex.querySubscriptions).toHaveLength(0);
    expect(convex.localQueryResultCalls).toEqual([{ queryName: 'todos:list', args: { count: 20 } }]);
  });

  it('subscribes on a cache miss and stays pending until the first result', async () => {
    // No seed, so the lookup misses and the client falls back to a
    // subscription — exactly as the real one does.
    const pending = service.count();

    expect(convex.querySubscriptions).toHaveLength(1);
    expect(requireLastQuerySubscription(convex).args).toEqual({ count: 20 });

    // Nothing resolves until the subscription delivers. Forget this line and
    // the promise simply never settles.
    requireLastQuerySubscription(convex).emit([todo('1', 'Write docs'), todo('2', 'Ship it')]);

    await expect(pending).resolves.toBe(2);

    // A one-shot read releases its subscription once it has settled.
    expect(convex.querySubscriptions[0].unsubscribeCount).toBe(1);
  });

  it('rejects when the subscription errors instead of delivering', async () => {
    const pending = service.count();

    requireLastQuerySubscription(convex).emitError(new Error('query failed'));

    await expect(pending).rejects.toThrow('query failed');
    expect(convex.querySubscriptions[0].unsubscribeCount).toBe(1);
  });
});
