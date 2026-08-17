import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, MockPaginatedSubscription, provideConvexTesting } from 'convex-angular/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference, PaginationResult } from 'convex/server';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { PaginatedQueryReference, injectPaginatedQuery } from './inject-paginated-query';

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:listTodosPaginated'),
}));

// Mock paginated query function reference
const mockPaginatedQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { paginationOpts: any },
  PaginationResult<{ _id: string; name: string }>
> as PaginatedQueryReference;

function requireLastPaginatedSubscription(convex: MockConvexClient): MockPaginatedSubscription {
  const subscription = convex.lastPaginatedSubscription();
  if (!subscription) {
    throw new Error('Expected a captured paginated subscription');
  }
  return subscription;
}

describe('injectPaginatedQuery', () => {
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

  it('should expose a pending, empty state before the subscription effect runs', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);

    // Before the first change detection nothing has been subscribed yet, but
    // the result already reads as an empty first page still loading.
    expect(convex.paginatedSubscriptions).toHaveLength(0);
    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
    expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
    expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('pending');
  });

  it('should initialize with loading state', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));

  it('should throw a clear error when experimental paginated subscriptions are unavailable', fakeAsync(() => {
    TestBed.resetTestingModule();
    // Deliberately not a MockConvexClient: a client that simply lacks the
    // experimental method is the honest double for this error path.
    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: {} as ConvexClient }],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);

    expect(() => {
      fixture.detectChanges();
      tick();
    }).toThrow(
      '[convex-angular] `injectPaginatedQuery()` requires a Convex client with experimental paginated query support.',
    );
  }));

  it('should subscribe to paginated query with correct arguments', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ category: this.category() }), {
        initialNumItems: 20,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const subscription = requireLastPaginatedSubscription(convex);
    expect(subscription.query).toBe(mockPaginatedQuery);
    expect(subscription.args).toEqual({ category: 'work' });
    expect(subscription.initialNumItems).toBe(20);

    // Subscribing correctly includes handing the client an error callback.
    const subscriptionError = new Error('subscription failed');
    subscription.emitError(subscriptionError);

    expect(fixture.componentInstance.todos.error()).toBe(subscriptionError);
  }));

  it('should subscribe through the pagination adapter when support is available', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    requireLastPaginatedSubscription(convex).emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(convex.paginatedSubscriptions).toHaveLength(1);
    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Todo 1' }]);
    expect(fixture.componentInstance.todos.status()).toBe('success');
  }));

  it('should update signals when LoadingFirstPage status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    requireLastPaginatedSubscription(convex).emit({
      results: [],
      status: 'LoadingFirstPage',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
  }));

  it('should apply every LoadingFirstPage emission when nothing was server-seeded', fakeAsync(() => {
    const firstLoadMore = jest.fn(() => true);
    const secondLoadMore = jest.fn(() => true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const subscription = requireLastPaginatedSubscription(convex);

    // Without a transferred seed to protect, the very first emission counts.
    subscription.emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'LoadingFirstPage',
      loadMore: firstLoadMore,
    });

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Todo 1' }]);
    expect(fixture.componentInstance.todos.loadMore(5)).toBe(true);
    expect(firstLoadMore).toHaveBeenCalledWith(5);

    // A later first-page emission on the same subscription is applied too.
    subscription.emit({
      results: [
        { _id: '1', name: 'Todo 1' },
        { _id: '2', name: 'Todo 2' },
      ],
      status: 'LoadingFirstPage',
      loadMore: secondLoadMore,
    });

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'Todo 1' },
      { _id: '2', name: 'Todo 2' },
    ]);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.loadMore(5)).toBe(true);
    expect(secondLoadMore).toHaveBeenCalledWith(5);
  }));

  it('should update signals when CanLoadMore status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [
      { _id: '1', name: 'Todo 1' },
      { _id: '2', name: 'Todo 2' },
    ];

    requireLastPaginatedSubscription(convex).emit({
      results: mockItems,
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
  }));

  it('should update signals when LoadingMore status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [{ _id: '1', name: 'Todo 1' }];

    requireLastPaginatedSubscription(convex).emit({
      results: mockItems,
      status: 'LoadingMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(true);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
  }));

  it('should update signals when Exhausted status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [
      { _id: '1', name: 'Todo 1' },
      { _id: '2', name: 'Todo 2' },
    ];

    requireLastPaginatedSubscription(convex).emit({
      results: mockItems,
      status: 'Exhausted',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(true);
  }));

  it('should call loadMore on the underlying client', fakeAsync(() => {
    const mockLoadMore = jest.fn(() => true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    requireLastPaginatedSubscription(convex).emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: mockLoadMore,
    });
    fixture.detectChanges();

    const result = fixture.componentInstance.todos.loadMore(5);

    expect(mockLoadMore).toHaveBeenCalledWith(5);
    expect(result).toBe(true);
  }));

  it('should return false from loadMore when not subscribed', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // Don't send any update, so currentLoadMore is undefined
    const result = fixture.componentInstance.todos.loadMore(5);

    expect(result).toBe(false);
  }));

  it('should report no load-more capability after a first-page error', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const testError = new Error('Test error');
    requireLastPaginatedSubscription(convex).emitError(testError);
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()).toBe(testError);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(fixture.componentInstance.todos.loadMore(5)).toBe(false);
  }));

  it('should preserve existing results and load-more capability on error after data loads', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [{ _id: '1', name: 'Todo 1' }];
    const subscription = requireLastPaginatedSubscription(convex);

    // First, load some data
    subscription.emit({
      results: mockItems,
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);

    // Then trigger an error
    const testError = new Error('Test error');
    subscription.emitError(testError);
    fixture.detectChanges();

    // Results should be preserved
    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.error()).toBe(testError);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
  }));

  it('should clear the exhausted flag when the subscription errors', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const subscription = requireLastPaginatedSubscription(convex);
    subscription.emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'Exhausted',
      loadMore: () => false,
    });

    expect(fixture.componentInstance.todos.isExhausted()).toBe(true);

    const testError = new Error('Test error');
    subscription.emitError(testError);

    // An errored list is no longer known to be complete.
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('error');
  }));

  it('should reset pagination when reset() is called', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = requireLastPaginatedSubscription(convex);

    // Load some data
    firstSubscription.emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results().length).toBe(1);

    // Reset
    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    // Should have called unsubscribe and resubscribed
    expect(firstSubscription.unsubscribed).toBe(true);
    expect(convex.paginatedSubscriptions).toHaveLength(2);
  }));

  it('should resubscribe from the first page when reset() is used after a first-page error', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = requireLastPaginatedSubscription(convex);
    firstSubscription.emitError(new Error('Test error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);

    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    expect(firstSubscription.unsubscribed).toBe(true);
    expect(convex.paginatedSubscriptions).toHaveLength(2);
    expect(fixture.componentInstance.todos.status()).toBe('pending');
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));

  it('should resubscribe when args change', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ category: this.category() }), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(convex.paginatedSubscriptions).toHaveLength(1);
    const firstSubscription = requireLastPaginatedSubscription(convex);

    // Change args
    fixture.componentInstance.category.set('personal');
    fixture.detectChanges();
    tick();

    expect(firstSubscription.unsubscribed).toBe(true);
    expect(convex.paginatedSubscriptions).toHaveLength(2);

    const latestSubscription = requireLastPaginatedSubscription(convex);
    expect(latestSubscription.query).toBe(mockPaginatedQuery);
    expect(latestSubscription.args).toEqual({ category: 'personal' });
    expect(latestSubscription.initialNumItems).toBe(10);

    // The replacement subscription is wired for errors too, not just results.
    const subscriptionError = new Error('subscription failed');
    latestSubscription.emitError(subscriptionError);

    expect(fixture.componentInstance.todos.error()).toBe(subscriptionError);
  }));

  it('should resubscribe when initialNumItems signal changes', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly pageSize = signal(10);
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: this.pageSize,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(convex.paginatedSubscriptions).toHaveLength(1);
    const firstSubscription = requireLastPaginatedSubscription(convex);

    // Change the reactive page size
    fixture.componentInstance.pageSize.set(20);
    fixture.detectChanges();
    tick();

    expect(firstSubscription.unsubscribed).toBe(true);
    expect(convex.paginatedSubscriptions).toHaveLength(2);

    const latestSubscription = requireLastPaginatedSubscription(convex);
    expect(latestSubscription.query).toBe(mockPaginatedQuery);
    expect(latestSubscription.args).toEqual({});
    expect(latestSubscription.initialNumItems).toBe(20);

    // The replacement subscription is wired for errors too, not just results.
    const subscriptionError = new Error('subscription failed');
    latestSubscription.emitError(subscriptionError);

    expect(fixture.componentInstance.todos.error()).toBe(subscriptionError);
  }));

  it('should ignore stale updates and stale loadMore handlers when args change', fakeAsync(() => {
    const staleLoadMore = jest.fn(() => true);
    const latestLoadMore = jest.fn(() => true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ category: this.category() }), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = convex.paginatedSubscriptions[0];

    fixture.componentInstance.category.set('personal');
    fixture.detectChanges();
    tick();

    const secondSubscription = convex.paginatedSubscriptions[1];
    const latestResults = [{ _id: '2', name: 'Latest todo' }];

    secondSubscription.emit({
      results: latestResults,
      status: 'CanLoadMore',
      loadMore: latestLoadMore,
    });

    // A real client never delivers to a retired callback; invoking it directly
    // is the only way to reach the helper's defensive generation guard.
    firstSubscription.emitAfterUnsubscribe({
      results: [{ _id: '1', name: 'Stale todo' }],
      status: 'CanLoadMore',
      loadMore: staleLoadMore,
    });

    expect(fixture.componentInstance.todos.results()).toEqual(latestResults);
    expect(fixture.componentInstance.todos.status()).toBe('success');

    fixture.componentInstance.todos.loadMore(5);

    expect(latestLoadMore).toHaveBeenCalledWith(5);
    expect(staleLoadMore).not.toHaveBeenCalled();
  }));

  it('should ignore stale errors after reset', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = convex.paginatedSubscriptions[0];

    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    const secondSubscription = convex.paginatedSubscriptions[1];
    const latestResults = [{ _id: '2', name: 'Latest todo' }];

    secondSubscription.emit({
      results: latestResults,
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

    expect(fixture.componentInstance.todos.results()).toEqual(latestResults);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(fixture.componentInstance.todos.status()).toBe('success');
  }));

  it('should ignore callbacks from a subscription that predates a skip and resume', fakeAsync(() => {
    const staleLoadMore = jest.fn(() => true);
    const latestLoadMore = jest.fn(() => true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly shouldSkip = signal(false);
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = convex.paginatedSubscriptions[0];

    fixture.componentInstance.shouldSkip.set(true);
    fixture.detectChanges();
    tick();

    fixture.componentInstance.shouldSkip.set(false);
    fixture.detectChanges();
    tick();

    const latestResults = [{ _id: '2', name: 'Latest todo' }];
    convex.paginatedSubscriptions[1].emit({
      results: latestResults,
      status: 'CanLoadMore',
      loadMore: latestLoadMore,
    });

    // The skip in between advanced the staleness guard too, so the very first
    // subscription must stay stale even though its args match again.
    firstSubscription.emitAfterUnsubscribe({
      results: [{ _id: '1', name: 'Stale todo' }],
      status: 'Exhausted',
      loadMore: staleLoadMore,
    });
    firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

    expect(fixture.componentInstance.todos.results()).toEqual(latestResults);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(fixture.componentInstance.todos.status()).toBe('success');

    fixture.componentInstance.todos.loadMore(5);

    expect(latestLoadMore).toHaveBeenCalledWith(5);
    expect(staleLoadMore).not.toHaveBeenCalled();
  }));

  it('should ignore callbacks from every subscription after destroy', fakeAsync(() => {
    const staleLoadMore = jest.fn(() => true);
    const latestLoadMore = jest.fn(() => true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ category: this.category() }), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = convex.paginatedSubscriptions[0];

    fixture.componentInstance.category.set('personal');
    fixture.detectChanges();
    tick();

    const secondSubscription = convex.paginatedSubscriptions[1];
    const latestResults = [{ _id: '2', name: 'Latest todo' }];
    secondSubscription.emit({
      results: latestResults,
      status: 'CanLoadMore',
      loadMore: latestLoadMore,
    });

    fixture.destroy();

    // Destroying must retire every generation, not just the newest one.
    firstSubscription.emitAfterUnsubscribe({
      results: [{ _id: '1', name: 'Stale todo' }],
      status: 'Exhausted',
      loadMore: staleLoadMore,
    });
    firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));
    secondSubscription.emitAfterUnsubscribe({
      results: [{ _id: '3', name: 'Post-destroy todo' }],
      status: 'Exhausted',
      loadMore: staleLoadMore,
    });
    secondSubscription.emitErrorAfterUnsubscribe(new Error('post-destroy failure'));

    expect(fixture.componentInstance.todos.results()).toEqual(latestResults);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);

    fixture.componentInstance.todos.loadMore(5);

    expect(latestLoadMore).toHaveBeenCalledWith(5);
    expect(staleLoadMore).not.toHaveBeenCalled();
  }));

  it('should unsubscribe on component destroy', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const subscription = requireLastPaginatedSubscription(convex);

    fixture.destroy();

    expect(subscription.unsubscribed).toBe(true);
  }));

  it('should clear error on successful update', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const subscription = requireLastPaginatedSubscription(convex);

    // Trigger an error first
    subscription.emitError(new Error('Test error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.error()).toBeDefined();

    // Then successful update
    subscription.emit({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: () => false,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));

  describe('equivalent args dedup', () => {
    it('should not resubscribe when reactive args serialize identically', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sig = signal(20);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ count: Math.min(this.sig(), 10) }), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);
      const subscription = requireLastPaginatedSubscription(convex);

      // Changes to a value that serializes to the same first-page args
      fixture.componentInstance.sig.set(30);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);
      expect(subscription.unsubscribed).toBe(false);
    }));

    it('should still resubscribe via reset() when args serialize identically', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sig = signal(20);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ count: Math.min(this.sig(), 10) }), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.sig.set(30);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);

      fixture.componentInstance.todos.reset();
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(2);
    }));

    it('should resubscribe after a skipToken transition even when args return to the same value', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(2);
    }));
  });

  describe('skipToken', () => {
    it('should not subscribe when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(0);
    }));

    it('should set isSkipped to true when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
    }));

    it('should set results to empty array when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.results()).toEqual([]);
    }));

    it('should set all loading/status signals correctly when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
      expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
      expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
      expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
    }));

    it('should conditionally skip based on signal value', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly category = signal<string | null>(null);
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => (this.category() ? { category: this.category() } : skipToken),
          { initialNumItems: 10 },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(convex.paginatedSubscriptions).toHaveLength(0);

      // Set category to enable query
      fixture.componentInstance.category.set('work');
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(convex.paginatedSubscriptions).toHaveLength(1);
    }));

    it('should clear results when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Load some data
      requireLastPaginatedSubscription(convex).emit({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.results().length).toBe(1);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);

      // Skip the query
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.results()).toEqual([]);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
    }));

    it('should unsubscribe when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);
      const subscription = requireLastPaginatedSubscription(convex);
      expect(subscription.unsubscribed).toBe(false);

      // Skip the query
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(subscription.unsubscribed).toBe(true);
    }));

    it('should not double-unsubscribe when toggling skipToken', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = requireLastPaginatedSubscription(convex);
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
      expect(firstSubscription.unsubscribeCount).toBe(1);

      const secondSubscription = requireLastPaginatedSubscription(convex);
      expect(secondSubscription.unsubscribeCount).toBe(0);

      // Skip again - should unsubscribe once more
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();
      expect(firstSubscription.unsubscribeCount).toBe(1);
      expect(secondSubscription.unsubscribeCount).toBe(1);
    }));

    it('should ignore stale callbacks after transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const firstSubscription = convex.paginatedSubscriptions[0];

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      firstSubscription.emitAfterUnsubscribe({
        results: [{ _id: '1', name: 'Stale todo' }],
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      firstSubscription.emitErrorAfterUnsubscribe(new Error('stale failure'));

      expect(fixture.componentInstance.todos.results()).toEqual([]);
      expect(fixture.componentInstance.todos.error()).toBeUndefined();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('skipped');
    }));

    it('should resubscribe when transitioning from skipped to active', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(0);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);

      // Enable the query
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(convex.paginatedSubscriptions).toHaveLength(1);
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    }));

    it('should return false from loadMore when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const result = fixture.componentInstance.todos.loadMore(5);
      expect(result).toBe(false);
    }));
  });

  describe('status signal', () => {
    it('should return pending status while loading first page', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('pending');
    }));

    it('should return success status after first page is loaded', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emit({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should return success status when exhausted', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emit({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'Exhausted',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should return error status after error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emitError(new Error('Query failed'));
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));

    it('should return skipped status when skipToken is used', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('skipped');
    }));
  });

  describe('isSuccess signal', () => {
    it('should be false while loading first page', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));

    it('should be true after first page is loaded', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emit({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(true);
    }));

    it('should be false when there is an error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emitError(new Error('Query failed'));
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));

    it('should be false when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => skipToken, { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
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
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
          onSuccess,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const mockResults = [{ _id: '1', name: 'Todo 1' }];
      requireLastPaginatedSubscription(convex).emit({
        results: mockResults,
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(onSuccess).toHaveBeenCalledWith(mockResults);
    }));

    it('should not call onSuccess during LoadingFirstPage status', fakeAsync(() => {
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
          onSuccess,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      requireLastPaginatedSubscription(convex).emit({
        results: [],
        status: 'LoadingFirstPage',
        loadMore: () => false,
      });
      fixture.detectChanges();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should call onError callback when error occurs', fakeAsync(() => {
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
          onError,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const error = new Error('Query failed');
      requireLastPaginatedSubscription(convex).emitError(error);
      fixture.detectChanges();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should work without callbacks', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const subscription = requireLastPaginatedSubscription(convex);

      // Should not throw
      subscription.emit({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: () => false,
      });
      subscription.emitError(new Error('Query failed'));

      expect(fixture.componentInstance.todos.error()).toBeDefined();
    }));
  });

  describe('injectRef', () => {
    it('should create a paginated query outside an injection context with injectRef', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);

      const todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
        injectRef: injector,
      });
      tick();

      const subscription = requireLastPaginatedSubscription(convex);
      expect(subscription.query).toBe(mockPaginatedQuery);
      expect(subscription.args).toEqual({});
      expect(subscription.initialNumItems).toBe(10);

      const result = [{ _id: '1', name: 'Todo 1' }];
      subscription.emit({
        results: result,
        status: 'CanLoadMore',
        loadMore: () => false,
      });

      expect(todos.results()).toEqual(result);

      // Both subscription callbacks are wired through the injectRef path.
      const subscriptionError = new Error('subscription failed');
      subscription.emitError(subscriptionError);

      expect(todos.error()).toBe(subscriptionError);
    }));

    it('should clean up subscriptions when the provided injector is destroyed', fakeAsync(() => {
      const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

      injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 10,
        injectRef: childInjector,
      });
      tick();

      const subscription = requireLastPaginatedSubscription(convex);
      expect(subscription.unsubscribeCount).toBe(0);

      childInjector.destroy();

      expect(subscription.unsubscribeCount).toBe(1);
    }));

    it('should still throw outside an injection context without injectRef', () => {
      expect(() =>
        injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
          initialNumItems: 10,
        }),
      ).toThrow();
    });
  });
});
