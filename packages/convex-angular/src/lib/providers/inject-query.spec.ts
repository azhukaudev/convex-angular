import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { skipToken } from '../skip-token';
import { QueryReference, injectQuery } from './inject-query';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

// Mock getFunctionName to avoid needing a real FunctionReference
jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:listTodos'),
}));

// Mock query function reference
const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
> as QueryReference;

function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

describe('injectQuery', () => {
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

  describe('initial state', () => {
    it('should expose an idle state until the subscription effect first runs', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);

      // Before the first change detection the effect has not established a
      // subscription, so nothing is loading, skipped or placeholder-backed.
      expect(convex.querySubscriptions).toHaveLength(0);
      expect(fixture.componentInstance.todos.data()).toBeUndefined();
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.isLoading()).toBe(false);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
    });

    it('should initialize with local query result if available', fakeAsync(() => {
      const cachedData = [{ _id: '1', title: 'Cached todo' }];
      convex.seedQueryResult('todos:listTodos', { count: 10 }, cachedData);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(cachedData);
    }));

    it('should initialize with undefined if no local result', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Nothing was seeded for these args, so the warm cache had nothing to
      // offer; data is set by the subscription callback, not initial state.
      expect(convex.localQueryResultCalls).toEqual([{ queryName: 'todos:listTodos', args: { count: 10 } }]);
      expect(convex.querySubscriptions).toHaveLength(1);
    }));

    it('should type data as query result or undefined', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      type TodosData = ReturnType<TestComponent['todos']['data']>;
      const assertTodosDataType: Assert<IsExact<TodosData, Array<{ _id: string; title: string }> | undefined>> = true;

      const typedData: TodosData = fixture.componentInstance.todos.data();

      expect(assertTodosDataType).toBe(true);
      expect(typedData).toBeUndefined();
    });

    it('should set isLoading to true initially', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
    }));

    it('should initialize with no error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.error()).toBeUndefined();
    }));

    it('should initialize with isSkipped false', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
    }));
  });

  describe('subscription', () => {
    it('should subscribe to query with correct arguments', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 20 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);
      expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
      expect(requireLastQuerySubscription(convex).args).toEqual({ count: 20 });

      // The subscription also carries an error callback: an emitted error is
      // surfaced rather than dropped.
      const error = new Error('Query failed');
      requireLastQuerySubscription(convex).emitError(error);
      expect(fixture.componentInstance.todos.error()).toBe(error);
    }));

    it('should update data signal on successful update', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const mockData = [
        { _id: '1', title: 'Todo 1' },
        { _id: '2', title: 'Todo 2' },
      ];
      requireLastQuerySubscription(convex).emit(mockData);

      expect(fixture.componentInstance.todos.data()).toEqual(mockData);
    }));

    it('should set isLoading to false on successful update', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.isLoading()).toBe(false);
    }));

    it('should clear error on successful update', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // First, set an error
      requireLastQuerySubscription(convex).emitError(new Error('Test error'));
      expect(fixture.componentInstance.todos.error()).toBeDefined();

      // Then, successful update
      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.error()).toBeUndefined();
    }));
  });

  describe('error handling', () => {
    it('should set error signal on query error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const error = new Error('Query failed');
      requireLastQuerySubscription(convex).emitError(error);

      expect(fixture.componentInstance.todos.error()).toBe(error);
    }));

    it('should preserve existing data on error for better UX', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // First, set some data
      const mockData = [{ _id: '1', title: 'Todo' }];
      requireLastQuerySubscription(convex).emit(mockData);
      expect(fixture.componentInstance.todos.data()).toBeDefined();

      // Then, error - data should be preserved
      requireLastQuerySubscription(convex).emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.data()).toEqual(mockData);
    }));

    it('should set isLoading to false on error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.isLoading()).toBe(false);
    }));
  });

  describe('skipToken', () => {
    it('should not subscribe when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(0);
    }));

    it('should set isSkipped to true when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
    }));

    it('should set data to undefined when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toBeUndefined();
    }));

    it('should set error to undefined when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.error()).toBeUndefined();
    }));

    it('should set isLoading to false when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isLoading()).toBe(false);
    }));

    it('should conditionally skip based on signal value', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly userId = signal<string | null>(null);
        readonly todos = injectQuery(mockQuery, () => (this.userId() ? { count: 10 } : skipToken));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(convex.querySubscriptions).toHaveLength(0);

      // Set userId to enable query
      fixture.componentInstance.userId.set('user-123');
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(convex.querySubscriptions).toHaveLength(1);
    }));

    it('should clear data/error when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Set some data
      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);
      expect(fixture.componentInstance.todos.data()).toBeDefined();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);

      // Skip the query
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toBeUndefined();
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.isLoading()).toBe(false);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
    }));

    it('should unsubscribe when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);
      const subscription = requireLastQuerySubscription(convex);
      expect(subscription.unsubscribeCount).toBe(0);

      // Skip the query
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should not double-unsubscribe when toggling skipToken', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);
      expect(firstSubscription.unsubscribeCount).toBe(0);

      // Skip the query - should unsubscribe once
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();
      expect(firstSubscription.unsubscribeCount).toBe(1);

      // Resume the query - should not unsubscribe again
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();
      const secondSubscription = requireLastQuerySubscription(convex);
      expect(firstSubscription.unsubscribeCount).toBe(1);
      expect(secondSubscription.unsubscribeCount).toBe(0);

      // Skip again - should unsubscribe once more
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();
      expect(firstSubscription.unsubscribeCount).toBe(1);
      expect(secondSubscription.unsubscribeCount).toBe(1);
    }));

    it('should resubscribe when transitioning from skipped to active', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(0);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);

      // Enable the query
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
    }));
  });

  describe('reactive arguments', () => {
    it('should resubscribe when argsFn returns different values', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
      expect(requireLastQuerySubscription(convex).args).toEqual({ count: 10 });

      // Change count
      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(2);
      expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
      expect(requireLastQuerySubscription(convex).args).toEqual({ count: 20 });

      // The resubscription carries an error callback too.
      const error = new Error('Query failed');
      requireLastQuerySubscription(convex).emitError(error);
      expect(fixture.componentInstance.todos.error()).toBe(error);
    }));

    it('should unsubscribe from previous subscription when args change', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);
      expect(firstSubscription.unsubscribeCount).toBe(0);

      // Change count
      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(firstSubscription.unsubscribeCount).toBe(1);
    }));

    it('should ignore stale updates when args change', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      const latestData = [{ _id: '2', title: 'Latest todo' }];

      requireLastQuerySubscription(convex).emit(latestData);
      expect(fixture.componentInstance.todos.data()).toEqual(latestData);

      // The real client would never call a retired callback; invoke it
      // directly to reach the defensive generation guard.
      firstSubscription.emitAfterUnsubscribe([{ _id: '1', title: 'Stale todo' }]);

      expect(fixture.componentInstance.todos.data()).toEqual(latestData);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should ignore stale errors when args change', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      const latestData = [{ _id: '2', title: 'Latest todo' }];

      requireLastQuerySubscription(convex).emit(latestData);
      firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

      expect(fixture.componentInstance.todos.data()).toEqual(latestData);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should ignore callbacks from a subscription that predates a skip and resume', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      const latestData = [{ _id: '2', title: 'Latest todo' }];
      requireLastQuerySubscription(convex).emit(latestData);

      // The skip in between advanced the staleness guard too, so the very
      // first subscription must stay stale even though its args match again.
      firstSubscription.emitAfterUnsubscribe([{ _id: '1', title: 'Stale todo' }]);
      firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

      expect(fixture.componentInstance.todos.data()).toEqual(latestData);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should hydrate from local cache when args change to a warm query', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const initialData = [{ _id: '1', title: 'Todo 10' }];
      const cachedData = [{ _id: '2', title: 'Todo 20 (cached)' }];
      requireLastQuerySubscription(convex).emit(initialData);

      convex.seedQueryResult('todos:listTodos', { count: 20 }, cachedData);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(cachedData);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('pending');
    }));

    it('should preserve previous data when args change and the new query is not cached', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({
          count: this.count(),
        }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const initialData = [{ _id: '1', title: 'Todo 10' }];
      requireLastQuerySubscription(convex).emit(initialData);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('pending');
    }));
  });

  describe('equivalent args dedup', () => {
    it('should not resubscribe when reactive args serialize identically', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sig = signal(20);
        readonly todos = injectQuery(mockQuery, () => ({ count: Math.min(this.sig(), 10) }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);

      // Changes to a value that serializes to the same args
      fixture.componentInstance.sig.set(30);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);
      expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);
    }));

    it('should still resubscribe via refetch() when args serialize identically', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sig = signal(20);
        readonly todos = injectQuery(mockQuery, () => ({ count: Math.min(this.sig(), 10) }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.sig.set(30);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);

      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(2);
    }));

    it('should resubscribe after a skipToken transition even when args return to the same value', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(2);
    }));
  });

  describe('cleanup', () => {
    it('should unsubscribe on component destroy', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastQuerySubscription(convex);
      expect(subscription.unsubscribeCount).toBe(0);

      fixture.destroy();

      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should ignore callbacks from every subscription after destroy', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({ count: this.count() }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      const secondSubscription = requireLastQuerySubscription(convex);
      const latestData = [{ _id: '2', title: 'Latest todo' }];
      secondSubscription.emit(latestData);

      fixture.destroy();

      // Destroying must retire every generation, not just the newest one.
      firstSubscription.emitAfterUnsubscribe([{ _id: '1', title: 'Stale todo' }]);
      firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));
      secondSubscription.emitAfterUnsubscribe([{ _id: '3', title: 'Post-destroy todo' }]);
      secondSubscription.emitErrorAfterUnsubscribe(new Error('post-destroy failure'));

      expect(fixture.componentInstance.todos.data()).toEqual(latestData);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
    }));

    it('should ignore stale updates after transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastQuerySubscription(convex);

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      firstSubscription.emitAfterUnsubscribe([{ _id: '1', title: 'Stale todo' }]);
      firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

      expect(fixture.componentInstance.todos.data()).toBeUndefined();
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('skipped');
    }));
  });

  describe('multiple updates', () => {
    it('should handle multiple sequential updates', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastQuerySubscription(convex);

      // First update
      subscription.emit([{ _id: '1', title: 'Todo 1' }]);
      expect(fixture.componentInstance.todos.data()?.length).toBe(1);

      // Second update
      subscription.emit([
        { _id: '1', title: 'Todo 1' },
        { _id: '2', title: 'Todo 2' },
      ]);
      expect(fixture.componentInstance.todos.data()?.length).toBe(2);

      // Third update
      subscription.emit([]);
      expect(fixture.componentInstance.todos.data()?.length).toBe(0);
    }));
  });

  describe('status signal', () => {
    it('should return pending status while loading', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('pending');
    }));

    it('should return success status after data is received', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should return error status after error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));

    it('should return skipped status when skipToken is used', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('skipped');
    }));

    it('should transition through statuses correctly', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.status()).toBe('skipped');

      // Enable query -> pending
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('pending');

      // Data received -> success
      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.status()).toBe('success');

      // Error -> error
      requireLastQuerySubscription(convex).emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));
  });

  describe('isSuccess signal', () => {
    it('should be false while loading', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));

    it('should be true after successful data load', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.isSuccess()).toBe(true);
    }));

    it('should be false when there is an error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));

    it('should be false when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => skipToken);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));
  });

  describe('refetch', () => {
    it('should trigger resubscription when refetch is called', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);

      // Refetch
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(convex.querySubscriptions).toHaveLength(2);
    }));

    it('should unsubscribe from previous subscription on refetch', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastQuerySubscription(convex);
      expect(subscription.unsubscribeCount).toBe(0);

      // Refetch
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should preserve existing data during refetch', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Set initial data
      const initialData = [{ _id: '1', title: 'Todo' }];
      requireLastQuerySubscription(convex).emit(initialData);

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);

      // Refetch - data should be preserved
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
    }));

    it('should hydrate from local cache during refetch for the same args', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const initialData = [{ _id: '1', title: 'Todo' }];
      const cachedData = [{ _id: '2', title: 'Todo (cached)' }];
      requireLastQuerySubscription(convex).emit(initialData);

      convex.seedQueryResult('todos:listTodos', { count: 10 }, cachedData);

      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(cachedData);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('pending');
    }));

    it('should set isLoading to true on refetch', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastQuerySubscription(convex).emit([{ _id: '1', title: 'Todo' }]);
      expect(fixture.componentInstance.todos.isLoading()).toBe(false);

      // Refetch
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
    }));
  });

  describe('options callbacks', () => {
    it('should call onSuccess callback when data is received', fakeAsync(() => {
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          onSuccess,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const mockData = [{ _id: '1', title: 'Todo' }];
      requireLastQuerySubscription(convex).emit(mockData);

      expect(onSuccess).toHaveBeenCalledWith(mockData);
    }));

    it('should call onSuccess callback on every update', fakeAsync(() => {
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          onSuccess,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastQuerySubscription(convex);
      subscription.emit([{ _id: '1', title: 'Todo 1' }]);
      subscription.emit([
        { _id: '1', title: 'Todo 1' },
        { _id: '2', title: 'Todo 2' },
      ]);

      expect(onSuccess).toHaveBeenCalledTimes(2);
    }));

    it('should call onError callback when error occurs', fakeAsync(() => {
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          onError,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const error = new Error('Query failed');
      requireLastQuerySubscription(convex).emitError(error);

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should work without options parameter', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Should not throw
      const subscription = requireLastQuerySubscription(convex);
      subscription.emit([{ _id: '1', title: 'Todo' }]);
      subscription.emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.error()).toBeDefined();
    }));
  });

  describe('preserve data on error', () => {
    it('should preserve existing data when error occurs', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Set initial data
      const initialData = [{ _id: '1', title: 'Todo' }];
      const subscription = requireLastQuerySubscription(convex);
      subscription.emit(initialData);

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);

      // Error occurs - data should be preserved
      subscription.emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);
      expect(fixture.componentInstance.todos.error()).toBeDefined();
    }));
  });

  describe('injectRef', () => {
    it('should create a query outside an injection context with injectRef', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);

      const todos = injectQuery(mockQuery, () => ({ count: 10 }), {
        injectRef: injector,
      });
      tick();

      expect(convex.querySubscriptions).toHaveLength(1);
      expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
      expect(requireLastQuerySubscription(convex).args).toEqual({ count: 10 });

      const result = [{ _id: '1', title: 'Todo 1' }];
      requireLastQuerySubscription(convex).emit(result);

      expect(todos.data()).toEqual(result);

      // Both callbacks are wired for an injectRef-created query.
      const error = new Error('Query failed');
      requireLastQuerySubscription(convex).emitError(error);
      expect(todos.error()).toBe(error);
    }));

    it('should clean up subscriptions when the provided injector is destroyed', fakeAsync(() => {
      const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

      injectQuery(mockQuery, () => ({ count: 10 }), {
        injectRef: childInjector,
      });
      tick();

      const subscription = requireLastQuerySubscription(convex);
      expect(subscription.unsubscribeCount).toBe(0);

      childInjector.destroy();

      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should let injectRef override the ambient component scope', fakeAsync(() => {
      const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          injectRef: childInjector,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastQuerySubscription(convex);

      fixture.destroy();
      expect(subscription.unsubscribeCount).toBe(0);

      childInjector.destroy();
      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should still throw outside an injection context without injectRef', () => {
      expect(() => injectQuery(mockQuery, () => ({ count: 10 }))).toThrow();
    });
  });
});
