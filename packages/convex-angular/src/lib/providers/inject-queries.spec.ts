import {
  Component,
  EnvironmentInjector,
  PLATFORM_ID,
  TransferState,
  createEnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { ConvexHydrationState, makeQueryStateKey, wrapQueryResult } from '../ssr/state-transfer';
import { injectQueries } from './inject-queries';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

const mockQueryNames = new Map<FunctionReference<'query'>, string>();

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn((query: FunctionReference<'query'>) => mockQueryNames.get(query)),
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

mockQueryNames.set(mockUserQuery, 'users:get');
mockQueryNames.set(mockTodosQuery, 'todos:list');
mockQueryNames.set(mockStatsQuery, 'stats:get');

const sameArgs = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * The captured subscriptions are an ordered list, so a key is identified by the
 * args it subscribed with. `occurrence` picks between repeated subscriptions
 * for the same args (a resubscribe appends a second one).
 */
function requireQuerySubscription(
  convex: MockConvexClient,
  args: Record<string, unknown>,
  occurrence = 0,
): MockQuerySubscription {
  const subscription = convex.querySubscriptions.filter((candidate) => sameArgs(candidate.args, args))[occurrence];
  if (!subscription) {
    throw new Error(`Expected query subscription #${occurrence} with args ${JSON.stringify(args)}`);
  }
  return subscription;
}

describe('injectQueries', () => {
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

    expect(convex.querySubscriptions).toHaveLength(2);
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      todos: undefined,
    });
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
      todos: 'pending',
    });
    expect(fixture.componentInstance.queries.isLoading()).toBe(true);

    requireQuerySubscription(convex, { userId: 'user-1' }).emit({
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

    requireQuerySubscription(convex, { count: 10 }).emit([{ _id: '1', title: 'Todo 1' }]);

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

  it('lists every active key in the results record while still pending', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly includeStats = signal(false);
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        ...(this.includeStats() ? { stats: { query: mockStatsQuery, args: { teamId: 'team-1' } } } : {}),
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // A pending key is present with an undefined value rather than absent, so
    // templates can iterate the record before any data has arrived.
    expect(Object.keys(fixture.componentInstance.queries.results())).toEqual(['user']);
    expect('user' in fixture.componentInstance.queries.results()).toBe(true);

    fixture.componentInstance.includeStats.set(true);
    fixture.detectChanges();
    tick();

    expect(Object.keys(fixture.componentInstance.queries.results()).sort()).toEqual(['stats', 'user']);
    expect('stats' in fixture.componentInstance.queries.results()).toBe(true);
  }));

  it('ignores callbacks from a subscription replaced by an args change', fakeAsync(() => {
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

    const stale = requireQuerySubscription(convex, { userId: 'user-1' });

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    requireQuerySubscription(convex, { userId: 'user-2' }).emit({ name: 'Latest' });

    // A real client could never call a retired callback; invoke it directly
    // to reach the helper's staleness guard.
    stale.emitAfterUnsubscribe({ name: 'Stale' });
    stale.emitErrorAfterUnsubscribe(new Error('stale failure'));

    expect(fixture.componentInstance.queries.results().user).toEqual({ name: 'Latest' });
    expect(fixture.componentInstance.queries.errors().user).toBeUndefined();
    expect(fixture.componentInstance.queries.statuses().user).toBe('success');
  }));

  it('does not resurrect a removed key from a late callback', fakeAsync(() => {
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

    const removed = requireQuerySubscription(convex, { teamId: 'team-1' });

    fixture.componentInstance.includeStats.set(false);
    fixture.detectChanges();
    tick();

    // The dropped key's subscription must not resurrect it.
    removed.emitAfterUnsubscribe({ total: 7 });
    removed.emitErrorAfterUnsubscribe(new Error('late failure'));

    expect('stats' in fixture.componentInstance.queries.results()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.errors()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.statuses()).toBe(false);
  }));

  it('seeds cached results per key before the first update', fakeAsync(() => {
    convex.seedQueryResult('users:get', { userId: 'user-1' }, { name: 'Cached user' });
    convex.seedQueryResult('todos:list', { count: 5 }, [{ _id: '1', title: 'Cached todo' }]);

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

    requireQuerySubscription(convex, { userId: 'user-1' }).emit({
      name: 'Ali',
    });

    const failure = new Error('Stats failed');
    requireQuerySubscription(convex, { teamId: 'team-1' }).emitError(failure);

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

    expect(convex.querySubscriptions).toHaveLength(1);
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

    expect(convex.querySubscriptions).toHaveLength(2);
    expect(fixture.componentInstance.queries.statuses()).toEqual({
      user: 'pending',
      todos: 'pending',
    });

    fixture.componentInstance.userId.set(null);
    fixture.detectChanges();
    tick();

    expect(requireQuerySubscription(convex, { userId: 'user-1' }).unsubscribeCount).toBe(1);
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

    requireQuerySubscription(convex, { teamId: 'team-1' }).emit({ total: 3 });
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
      stats: { total: 3 },
    });

    fixture.componentInstance.includeStats.set(false);
    fixture.detectChanges();
    tick();

    expect(requireQuerySubscription(convex, { teamId: 'team-1' }).unsubscribeCount).toBe(1);
    expect(fixture.componentInstance.queries.results()).toEqual({
      user: undefined,
    });
    expect('stats' in fixture.componentInstance.queries.results()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.errors()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.statuses()).toBe(false);
  }));

  it('removes a deleted skipped key from the keyed records', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly includeStats = signal(true);
      readonly queries = injectQueries(() => ({
        user: { query: mockUserQuery, args: { userId: 'user-1' } },
        ...(this.includeStats() ? { stats: skipToken } : {}),
      }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // A skipped key is reported even though it never owns a subscription.
    expect('stats' in fixture.componentInstance.queries.results()).toBe(true);
    expect('stats' in fixture.componentInstance.queries.errors()).toBe(true);
    expect('stats' in fixture.componentInstance.queries.statuses()).toBe(true);
    expect(fixture.componentInstance.queries.statuses().stats).toBe('skipped');

    fixture.componentInstance.includeStats.set(false);
    fixture.detectChanges();
    tick();

    // `in` rather than toEqual: toEqual treats `{}` and `{stats: undefined}`
    // as equal, so it cannot tell a removed key from a stale one.
    expect('stats' in fixture.componentInstance.queries.results()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.errors()).toBe(false);
    expect('stats' in fixture.componentInstance.queries.statuses()).toBe(false);
    expect(Object.keys(fixture.componentInstance.queries.statuses())).toEqual(['user']);
  }));

  it('keeps a skipped key in every record while it stays in the definition', fakeAsync(() => {
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

    // Repeated reconciliations must not drop a key that is merely skipped.
    fixture.componentInstance.queries.refetch();
    fixture.detectChanges();
    tick();

    expect(Object.keys(fixture.componentInstance.queries.results()).sort()).toEqual(['todos', 'user']);
    expect(Object.keys(fixture.componentInstance.queries.errors()).sort()).toEqual(['todos', 'user']);
    expect(Object.keys(fixture.componentInstance.queries.statuses()).sort()).toEqual(['todos', 'user']);
    expect(fixture.componentInstance.queries.results().user).toBeUndefined();
    expect(fixture.componentInstance.queries.errors().user).toBeUndefined();
    expect(fixture.componentInstance.queries.statuses().user).toBe('skipped');
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

    const initialTodosSubscription = requireQuerySubscription(convex, { count: 10 });

    fixture.componentInstance.userId.set('user-2');
    fixture.detectChanges();
    tick();

    expect(requireQuerySubscription(convex, { userId: 'user-1' }).unsubscribeCount).toBe(1);
    expect(convex.querySubscriptions).toHaveLength(3);
    expect(initialTodosSubscription.unsubscribeCount).toBe(0);
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

    expect(requireQuerySubscription(convex, { userId: 'user-1' }).unsubscribeCount).toBe(1);
    expect(requireQuerySubscription(convex, { count: 10 }).unsubscribeCount).toBe(1);
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

    expect(convex.querySubscriptions).toHaveLength(1);
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

    expect(requireQuerySubscription(convex, { userId: 'user-1' }).unsubscribeCount).toBe(1);
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

  describe('per-key callbacks', () => {
    it('invokes onSuccess with the key and data for each query', fakeAsync(() => {
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly queries = injectQueries(
          () => ({
            user: { query: mockUserQuery, args: { userId: 'user-1' } },
            todos: { query: mockTodosQuery, args: { count: 10 } },
          }),
          { onSuccess },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireQuerySubscription(convex, { userId: 'user-1' }).emit({ name: 'Ada' });
      expect(onSuccess).toHaveBeenCalledWith('user', { name: 'Ada' });

      requireQuerySubscription(convex, { count: 10 }).emit([{ _id: '1', title: 'T' }]);
      expect(onSuccess).toHaveBeenCalledWith('todos', [{ _id: '1', title: 'T' }]);
    }));

    it('invokes onError with the key and error', fakeAsync(() => {
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly queries = injectQueries(
          () => ({
            user: { query: mockUserQuery, args: { userId: 'user-1' } },
          }),
          { onError },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const queryError = new Error('boom');
      requireQuerySubscription(convex, { userId: 'user-1' }).emitError(queryError);

      expect(onError).toHaveBeenCalledWith('user', queryError);
    }));
  });

  describe('refetch', () => {
    it('resubscribes all active queries with unchanged definitions', fakeAsync(() => {
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

      expect(convex.querySubscriptions).toHaveLength(2);

      // Deliver data, then refetch: subscriptions are re-established and
      // existing data is preserved while pending.
      requireQuerySubscription(convex, { userId: 'user-1' }).emit({ name: 'Ada' });
      const originalSubscription = requireQuerySubscription(convex, { userId: 'user-1' });
      fixture.componentInstance.queries.refetch();
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(4);
      expect(originalSubscription.unsubscribed).toBe(true);
      expect(fixture.componentInstance.queries.statuses()).toEqual({ user: 'pending', todos: 'pending' });
      expect(fixture.componentInstance.queries.results().user).toEqual({ name: 'Ada' });
    }));
  });

  describe('SSR (server platform)', () => {
    let mockLoader: { enabled: boolean; fetch: jest.Mock };
    let serverConvex: MockConvexClient;

    beforeEach(() => {
      TestBed.resetTestingModule();

      mockLoader = {
        enabled: true,
        fetch: jest.fn((query: FunctionReference<'query'>) => {
          const queryName = mockQueryNames.get(query);
          if (queryName === 'users:get') {
            return Promise.resolve({ name: 'Server user' });
          }
          return Promise.resolve([{ _id: '1', title: 'Server todo' }]);
        }),
      };

      serverConvex = new MockConvexClient({ disabled: true });

      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'server' },
          provideConvexTesting(serverConvex),
          { provide: ConvexServerQueryLoader, useValue: mockLoader },
        ],
      });
    });

    it('fetches each definition over the loader without subscribing', fakeAsync(() => {
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

      expect(mockLoader.fetch).toHaveBeenCalledTimes(2);
      // A disabled client records the subscriptions it refused, so an empty
      // record proves the helper never attempted to subscribe on the server.
      expect(serverConvex.refusedSubscriptions).toHaveLength(0);
      expect(fixture.componentInstance.queries.statuses()).toEqual({ user: 'success', todos: 'success' });
      expect(fixture.componentInstance.queries.results()).toEqual({
        user: { name: 'Server user' },
        todos: [{ _id: '1', title: 'Server todo' }],
      });
      expect(fixture.componentInstance.queries.isLoading()).toBe(false);
    }));

    it('records per-key errors while other keys succeed', fakeAsync(() => {
      const fetchError = new Error('users fetch failed');
      mockLoader.fetch.mockImplementation((query: FunctionReference<'query'>) => {
        if (mockQueryNames.get(query) === 'users:get') {
          return Promise.reject(fetchError);
        }
        return Promise.resolve([{ _id: '1', title: 'Server todo' }]);
      });

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

      expect(fixture.componentInstance.queries.statuses()).toEqual({ user: 'error', todos: 'success' });
      expect(fixture.componentInstance.queries.errors().user).toBe(fetchError);
      expect(fixture.componentInstance.queries.results().todos).toEqual([{ _id: '1', title: 'Server todo' }]);
    }));

    it('keeps skipped keys skipped and stays pending without a loader', fakeAsync(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }, provideConvexTesting(serverConvex)],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly queries = injectQueries(() => ({
          user: skipToken,
          todos: { query: mockTodosQuery, args: { count: 10 } },
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.queries.statuses()).toEqual({ user: 'skipped', todos: 'pending' });
    }));
  });

  describe('hydration seeding (browser)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideConvexTesting(convex), ConvexHydrationState],
      });
    });

    it('seeds transferred entries individually with success status', fakeAsync(() => {
      const transferState = TestBed.inject(TransferState);
      transferState.set(makeQueryStateKey('todos:list', '{"count":10}'), wrapQueryResult([{ _id: '1', title: 'T' }]));

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

      // todos was transferred; user was not and stays pending.
      expect(fixture.componentInstance.queries.statuses()).toEqual({ user: 'pending', todos: 'success' });
      expect(fixture.componentInstance.queries.results().todos).toEqual([{ _id: '1', title: 'T' }]);

      // Live subscriptions are established for both keys.
      expect(convex.querySubscriptions).toHaveLength(2);

      // A live update replaces the seeded value.
      requireQuerySubscription(convex, { count: 10 }).emit([{ _id: '1', title: 'Live' }]);
      expect(fixture.componentInstance.queries.results().todos).toEqual([{ _id: '1', title: 'Live' }]);
      tick();
    }));
  });
});
