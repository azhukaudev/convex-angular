import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference, getFunctionName } from 'convex/server';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { injectQueries } from './inject-queries';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

const queryNames = new Map<FunctionReference<'query'>, string>();

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn((query: FunctionReference<'query'>) => queryNames.get(query)),
}));

const mockUserQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { userId: string },
  { name: string }
>;
const mockTodosQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
>;
const mockStatsQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { teamId: string },
  { total: number }
>;
const mockSearchQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { filters: { channel: string; listId: string } },
  { name: string }
>;

queryNames.set(mockUserQuery, 'users:get');
queryNames.set(mockTodosQuery, 'todos:list');
queryNames.set(mockStatsQuery, 'stats:get');
queryNames.set(mockSearchQuery, 'users:search');

describe('injectQueries', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockLocalQueryResult: jest.Mock;
  let unsubscribeByKey: Map<string, jest.Mock>;
  let onUpdateByKey: Map<string, (result: unknown) => void>;
  let onErrorByKey: Map<string, (error: Error) => void>;
  let localResultsByKey: Map<string, unknown>;

  const keyFor = (queryName: string, args: Record<string, unknown>) => `${queryName}:${JSON.stringify(args)}`;

  beforeEach(() => {
    unsubscribeByKey = new Map();
    onUpdateByKey = new Map();
    onErrorByKey = new Map();
    localResultsByKey = new Map();

    mockLocalQueryResult = jest.fn((queryName: string, args: Record<string, unknown>) =>
      localResultsByKey.get(keyFor(queryName, args)),
    );

    mockConvexClient = {
      client: {
        localQueryResult: mockLocalQueryResult,
      },
      onUpdate: jest.fn((query, args, onUpdate, onError) => {
        const queryName = (getFunctionName as jest.Mock)(query) as string;
        const key = keyFor(queryName, args as Record<string, unknown>);
        const unsubscribe = jest.fn();

        unsubscribeByKey.set(key, unsubscribe);
        onUpdateByKey.set(key, onUpdate);
        onErrorByKey.set(key, onError);

        return unsubscribe;
      }),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('subscribes to multiple keys and tracks aggregate loading', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        todos: { query: mockTodosQuery, args: { count: 10 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      todos: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
      todos: 'pending',
    });
    expect(fixture.componentInstance.queries.isLoading()).toBe(true);

    onUpdateByKey.get(keyFor('users:get', { userId: 'user-1' }))?.({
      name: 'Ali',
    });

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Ali' },
      todos: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
      todos: 'pending',
    });
    expect(fixture.componentInstance.queries.isLoading()).toBe(true);

    onUpdateByKey.get(keyFor('todos:list', { count: 10 }))?.([{ _id: '1', title: 'Todo 1' }]);

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Ali' },
      todos: [{ _id: '1', title: 'Todo 1' }],
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
      todos: 'success',
    });
    expect(fixture.componentInstance.queries.isLoading()).toBe(false);
  }));

  it('exposes requested keys as pending before the first render cycle', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        todos: { query: mockTodosQuery, args: { count: 10 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      todos: undefined,
    });
    expect(fixture.componentInstance.queries.errors()).toEqual({
      user: undefined,
      todos: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
      todos: 'pending',
    });
    expect(fixture.componentInstance.queries.isLoading()).toBe(true);
  });

  it('seeds cached results per key before the first update', fakeAsync(() => {
    localResultsByKey.set(keyFor('users:get', { userId: 'user-1' }), {
      name: 'Cached user',
    });
    localResultsByKey.set(keyFor('todos:list', { count: 5 }), [{ _id: '1', title: 'Cached todo' }]);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        todos: { query: mockTodosQuery, args: { count: 5 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Cached user' },
      todos: [{ _id: '1', title: 'Cached todo' }],
    });
  }));

  it('tracks per-key errors without disturbing sibling data', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        stats: { query: mockStatsQuery, args: { teamId: 'team-1' } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateByKey.get(keyFor('users:get', { userId: 'user-1' }))?.({
      name: 'Ali',
    });

    const failure = new Error('Stats failed');
    onErrorByKey.get(keyFor('stats:get', { teamId: 'team-1' }))?.(failure);

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Ali' },
      stats: undefined,
    });
    expect(fixture.componentInstance.queries.errors()).toEqual({
      user: undefined,
      stats: failure,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
      stats: 'error',
    });
  }));

  it('keeps skipped keys present without subscribing to them', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly userId = signal<string | null>(null);
      readonly queries = injectQueries(() => {
        const userId = this.userId();
        return {
          user: userId ? { query: mockUserQuery, args: { userId } } : skipToken,
          todos: { query: mockTodosQuery, args: { count: 10 } },
        };
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'skipped',
      todos: 'pending',
    });
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      todos: undefined,
    });

    fixture.componentInstance.userId.set('user-1');
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
      todos: 'pending',
    });

    fixture.componentInstance.userId.set(null);
    fixture.detectChanges();
    tick();

    expect(unsubscribeByKey.get(keyFor('users:get', { userId: 'user-1' }))).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.queries.statuses().user).toBe('skipped');
  }));

  it('removes deleted keys from the keyed records', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly includeStats = signal(true);
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        ...(this.includeStats() ? { stats: { query: mockStatsQuery, args: { teamId: 'team-1' } } } : {}),
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateByKey.get(keyFor('stats:get', { teamId: 'team-1' }))?.({ total: 3 });
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      stats: { total: 3 },
    });

    fixture.componentInstance.includeStats.set(false);
    fixture.detectChanges();
    tick();

    expect(unsubscribeByKey.get(keyFor('stats:get', { teamId: 'team-1' }))).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
    });
    expect('stats' in fixture.componentInstance.queries.results()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.errors()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.statuses()).toBe(false);
  }));

  it('only resubscribes the changed key when args change', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly userId = signal('user-1');
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: this.userId() } },
        todos: { query: mockTodosQuery, args: { count: 10 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const initialTodosSubscription = unsubscribeByKey.get(keyFor('todos:list', { count: 10 }));

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    expect(unsubscribeByKey.get(keyFor('users:get', { userId: 'user-1' }))).toHaveBeenCalledTimes(1);
    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(3);
    expect(initialTodosSubscription).not.toHaveBeenCalled();
  }));

  it('hydrates a changed key from warm cache before the next update arrives', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly userId = signal('user-1');
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: this.userId() } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateByKey.get(keyFor('users:get', { userId: 'user-1' }))?.({
      name: 'Ali',
    });
    localResultsByKey.set(keyFor('users:get', { userId: 'user-2' }), {
      name: 'Bea (cached)',
    });

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Bea (cached)' },
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
    });
  }));

  it('clears the previous value when a changed key has no warm cache entry', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly userId = signal('user-1');
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: this.userId() } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateByKey.get(keyFor('users:get', { userId: 'user-1' }))?.({
      name: 'Ali',
    });

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
    });
  }));

  it('does not resubscribe a keyed query when only arg object key order changes', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly filters = signal<{ channel: string; listId: string }>({
        channel: 'general',
        listId: 'list-1',
      });
      readonly queries = injectQueries(() => ({
        user: { query: mockSearchQuery, args: { filters: this.filters() } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const initialResult = { name: 'Ali' };
    onUpdateByKey.get(keyFor('users:search', { filters: { channel: 'general', listId: 'list-1' } }))?.(initialResult);

    fixture.componentInstance.filters.set({
      listId: 'list-1',
      channel: 'general',
    });
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
    expect(
      unsubscribeByKey.get(keyFor('users:search', { filters: { channel: 'general', listId: 'list-1' } })),
    ).not.toHaveBeenCalled();
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: initialResult,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
    });
  }));

  it('ignores stale updates and errors after a keyed resubscribe', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly userId = signal('user-1');
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: this.userId() } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const staleUpdate = onUpdateByKey.get(keyFor('users:get', { userId: 'user-1' }));
    const staleError = onErrorByKey.get(keyFor('users:get', { userId: 'user-1' }));

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    onUpdateByKey.get(keyFor('users:get', { userId: 'user-2' }))?.({
      name: 'Bea',
    });
    staleUpdate?.({
      name: 'Stale',
    });
    staleError?.(new Error('stale failure'));

    expect(fixture.componentInstance.queries.results()).toEqual({
      user: { name: 'Bea' },
    });
    expect(fixture.componentInstance.queries.errors()).toEqual({
      user: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'success',
    });
  }));

  it('cleans up all subscriptions when the component is destroyed', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        todos: { query: mockTodosQuery, args: { count: 10 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    fixture.destroy();

    expect(unsubscribeByKey.get(keyFor('users:get', { userId: 'user-1' }))).toHaveBeenCalledTimes(1);
    expect(unsubscribeByKey.get(keyFor('todos:list', { count: 10 }))).toHaveBeenCalledTimes(1);
  }));

  it('supports injectRef outside the current injection context', fakeAsync(() => {
    const injector = TestBed.inject(EnvironmentInjector);

    const queries = injectQueries(
      () => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
      }),
      { injectRef: injector },
    );

    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
    expect(queries.statuses()).toEqual({ user: 'pending' });
  }));

  it('cleans up subscriptions when the provided injectRef is destroyed', fakeAsync(() => {
    const rootInjector = TestBed.inject(EnvironmentInjector);
    const childInjector = createEnvironmentInjector([], rootInjector);

    injectQueries(
      () => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
      }),
      { injectRef: childInjector },
    );

    tick();
    childInjector.destroy();

    expect(unsubscribeByKey.get(keyFor('users:get', { userId: 'user-1' }))).toHaveBeenCalledTimes(1);
  }));

  it('infers keyed result types from the query definitions', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        todos: { query: mockTodosQuery, args: { count: 10 } },
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    type Results = ReturnType<TestComponent['queries']['results']>;
    const assertResultsType: Assert<
      IsExact<
        Results,
        {
          user: { name: string } | undefined;
          todos: Array<{ _id: string; title: string }> | undefined;
        }
      >
    > = true;

    const typedResults: Results = fixture.componentInstance.queries.results();

    expect(assertResultsType).toBe(true);
    expect(typedResults).toEqual({ user: undefined, todos: undefined });
  });
});
