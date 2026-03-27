import { Component, EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference, PaginationResult } from 'convex/server';
import { ConvexError } from 'convex/values';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { PaginatedQueryReference, injectPaginatedQuery } from './inject-paginated-query';

type Todo = { _id: string; name: string };
type TodoPage = PaginationResult<Todo>;

type RecordedSubscription = {
  args: {
    paginationOpts: {
      cursor: string | null;
      endCursor?: string;
      id: number;
      numItems: number;
    };
    [key: string]: unknown;
  };
  onError: (err: Error) => void;
  onUpdate: (result: TodoPage) => void;
  unsubscribe: jest.Mock;
};

const mockPaginatedQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { paginationOpts: any },
  TodoPage
> as PaginatedQueryReference;

const mockFilteredPaginatedQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { filters: { channel: string; listId: string }; paginationOpts: any },
  TodoPage
> as PaginatedQueryReference;

function pageResult(page: Todo[], overrides: Partial<TodoPage> = {}): TodoPage {
  return {
    page,
    isDone: false,
    continueCursor: 'cursor-next',
    ...overrides,
  };
}

describe('injectPaginatedQuery', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let subscriptions: RecordedSubscription[];

  beforeEach(() => {
    subscriptions = [];

    mockConvexClient = {
      onUpdate: jest.fn((_query, args, onUpdate, onError) => {
        const unsubscribe = jest.fn();
        subscriptions.push({
          args: args as RecordedSubscription['args'],
          onUpdate: onUpdate as RecordedSubscription['onUpdate'],
          onError: onError as RecordedSubscription['onError'],
          unsubscribe,
        });
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

  const latestSubscription = () => subscriptions[subscriptions.length - 1];

  const findSubscription = (predicate: (subscription: RecordedSubscription) => boolean): RecordedSubscription => {
    const match = [...subscriptions].reverse().find(predicate);
    if (!match) {
      throw new Error('Expected subscription to exist');
    }
    return match;
  };

  it('subscribes to the first page with an isolated pagination id', fakeAsync(() => {
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

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].args.paginationOpts).toEqual(
      expect.objectContaining({
        cursor: null,
        id: expect.any(Number),
        numItems: 10,
      }),
    );
    expect(fixture.componentInstance.todos.status()).toBe('loadingFirstPage');
    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
  }));

  it('isolates concurrent helpers with identical args', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly first = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 2,
      });
      readonly second = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 2,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstInitial = subscriptions[0];
    const secondInitial = subscriptions[1];

    expect(firstInitial.args.paginationOpts.id).not.toBe(secondInitial.args.paginationOpts.id);

    firstInitial.onUpdate(
      pageResult(
        [
          { _id: '1', name: 'One' },
          { _id: '2', name: 'Two' },
        ],
        { continueCursor: 'cursor-a' },
      ),
    );
    secondInitial.onUpdate(
      pageResult(
        [
          { _id: 'a', name: 'Alpha' },
          { _id: 'b', name: 'Beta' },
        ],
        { continueCursor: 'cursor-b' },
      ),
    );

    expect(fixture.componentInstance.first.loadMore(2)).toBe(true);

    const firstNext = latestSubscription();
    expect(firstNext.args.paginationOpts).toEqual({
      cursor: 'cursor-a',
      id: firstInitial.args.paginationOpts.id,
      numItems: 2,
    });

    firstNext.onUpdate(
      pageResult(
        [
          { _id: '3', name: 'Three' },
          { _id: '4', name: 'Four' },
        ],
        { isDone: true, continueCursor: 'cursor-a-2' },
      ),
    );

    expect(fixture.componentInstance.first.results()).toEqual([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
      { _id: '4', name: 'Four' },
    ]);
    expect(fixture.componentInstance.second.results()).toEqual([
      { _id: 'a', name: 'Alpha' },
      { _id: 'b', name: 'Beta' },
    ]);
  }));

  it('starts a fresh session on reset and ignores stale callbacks', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 2,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSession = subscriptions[0];
    firstSession.onUpdate(
      pageResult(
        [
          { _id: '1', name: 'One' },
          { _id: '2', name: 'Two' },
        ],
        { continueCursor: 'cursor-a' },
      ),
    );

    expect(fixture.componentInstance.todos.loadMore(2)).toBe(true);
    const firstSessionPageTwo = latestSubscription();

    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    const resetSession = latestSubscription();
    expect(resetSession.args.paginationOpts.id).not.toBe(firstSession.args.paginationOpts.id);
    expect(firstSession.unsubscribe).toHaveBeenCalled();
    expect(firstSessionPageTwo.unsubscribe).toHaveBeenCalled();

    firstSessionPageTwo.onUpdate(
      pageResult([{ _id: 'stale', name: 'Stale page' }], {
        isDone: true,
        continueCursor: 'stale-cursor',
      }),
    );
    firstSession.onError(new Error('stale failure'));

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(fixture.componentInstance.todos.status()).toBe('loadingFirstPage');

    resetSession.onUpdate(
      pageResult([{ _id: 'fresh', name: 'Fresh page' }], {
        isDone: true,
        continueCursor: 'fresh-cursor',
      }),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: 'fresh', name: 'Fresh page' }]);
    expect(fixture.componentInstance.todos.status()).toBe('exhausted');
  }));

  it('resubscribes when args change and ignores stale updates', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({ category: this.category() }), {
        initialNumItems: 3,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstSubscription = subscriptions[0];
    fixture.componentInstance.category.set('personal');
    fixture.detectChanges();
    tick();

    const secondSubscription = latestSubscription();
    expect(secondSubscription.args.category).toBe('personal');
    expect(secondSubscription.args.paginationOpts.id).not.toBe(firstSubscription.args.paginationOpts.id);

    secondSubscription.onUpdate(pageResult([{ _id: '2', name: 'Latest todo' }], { isDone: true }));
    firstSubscription.onUpdate(pageResult([{ _id: '1', name: 'Stale todo' }], { isDone: true }));

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '2', name: 'Latest todo' }]);
    expect(fixture.componentInstance.todos.status()).toBe('exhausted');
  }));

  it('resubscribes when initialNumItems changes and preserves stable arg equality', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly filters = signal<{ channel: string; listId: string }>({
        channel: 'general',
        listId: 'list-1',
      });
      readonly pageSize = signal(5);
      readonly todos = injectPaginatedQuery(mockFilteredPaginatedQuery, () => ({ filters: this.filters() }), {
        initialNumItems: this.pageSize,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const initialSubscription = subscriptions[0];

    fixture.componentInstance.filters.set({
      listId: 'list-1',
      channel: 'general',
    });
    fixture.detectChanges();
    tick();

    expect(subscriptions).toHaveLength(1);

    fixture.componentInstance.pageSize.set(8);
    fixture.detectChanges();
    tick();

    const resizedSubscription = latestSubscription();
    expect(subscriptions).toHaveLength(2);
    expect(resizedSubscription.args.paginationOpts.numItems).toBe(8);
    expect(resizedSubscription.args.paginationOpts.id).not.toBe(initialSubscription.args.paginationOpts.id);
  }));

  it('restarts from the first page on InvalidCursor without surfacing an error', fakeAsync(() => {
    const onError = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 2,
        onError,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(pageResult([{ _id: '1', name: 'One' }], { continueCursor: 'cursor-a' }));
    fixture.componentInstance.todos.loadMore(2);

    const secondPage = latestSubscription();
    const invalidCursorError = new ConvexError('pagination invalid');
    (invalidCursorError as ConvexError<any>).data = {
      isConvexSystemError: true,
      paginationError: 'InvalidCursor',
    };
    secondPage.onError(invalidCursorError);
    fixture.detectChanges();
    tick();

    const restartedPage = latestSubscription();
    expect(restartedPage.args.paginationOpts.cursor).toBeNull();
    expect(restartedPage.args.paginationOpts.id).not.toBe(firstPage.args.paginationOpts.id);
    expect(fixture.componentInstance.todos.status()).toBe('loadingFirstPage');
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('injectPaginatedQuery hit error, resetting pagination state:'),
    );

    warnSpy.mockRestore();
  }));

  it('keeps the initial split-required state pending until the first logical page becomes usable', fakeAsync(() => {
    const onSuccess = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
        onSuccess,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(
      pageResult([{ _id: 'p', name: 'Partial' }], {
        continueCursor: 'cursor-after-split',
        pageStatus: 'SplitRequired',
        splitCursor: 'split-at',
      }),
    );

    const leftSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === null && subscription.args.paginationOpts.endCursor === 'split-at',
    );
    const rightSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === 'split-at' &&
        subscription.args.paginationOpts.endCursor === 'cursor-after-split',
    );

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('loadingFirstPage');
    expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();

    leftSplit.onUpdate(
      pageResult([{ _id: '1', name: 'First half' }], {
        continueCursor: 'split-at',
        isDone: false,
      }),
    );
    rightSplit.onUpdate(
      pageResult([{ _id: '2', name: 'Second half' }], {
        continueCursor: 'cursor-after-split',
        isDone: false,
      }),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'First half' },
      { _id: '2', name: 'Second half' },
    ]);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('canLoadMore');
    expect(fixture.componentInstance.todos.isSuccess()).toBe(true);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
    expect(firstPage.unsubscribe).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith([
      { _id: '1', name: 'First half' },
      { _id: '2', name: 'Second half' },
    ]);
  }));

  it('does not re-fire onSuccess for unresolved split-recommended child updates with unchanged logical results', fakeAsync(() => {
    const onSuccess = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
        onSuccess,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(
      pageResult(
        [
          { _id: '1', name: 'One' },
          { _id: '2', name: 'Two' },
          { _id: '3', name: 'Three' },
        ],
        {
          continueCursor: 'cursor-after-split',
          pageStatus: 'SplitRecommended',
          splitCursor: 'split-at',
        },
      ),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
    ]);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenLastCalledWith([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
    ]);

    const leftSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === null && subscription.args.paginationOpts.endCursor === 'split-at',
    );
    const rightSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === 'split-at' &&
        subscription.args.paginationOpts.endCursor === 'cursor-after-split',
    );

    leftSplit.onUpdate(
      pageResult([{ _id: '1', name: 'One' }], {
        continueCursor: 'split-at',
      }),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    rightSplit.onUpdate(
      pageResult(
        [
          { _id: '2', name: 'Two' },
          { _id: '3', name: 'Three' },
        ],
        {
          continueCursor: 'cursor-after-split',
        },
      ),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
    ]);
    expect(firstPage.unsubscribe).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);

    rightSplit.onUpdate(
      pageResult(
        [
          { _id: '2', name: 'Two' },
          { _id: '3', name: 'Three' },
        ],
        {
          continueCursor: 'cursor-after-split',
        },
      ),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([
      { _id: '1', name: 'One' },
      { _id: '2', name: 'Two' },
      { _id: '3', name: 'Three' },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  }));

  it('treats later-page split-required resolution as loading more, not first-page loading', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(pageResult([{ _id: '1', name: 'One' }], { continueCursor: 'cursor-a' }));

    expect(fixture.componentInstance.todos.loadMore(1)).toBe(true);
    const secondPage = latestSubscription();
    secondPage.onUpdate(
      pageResult([{ _id: 'p', name: 'Partial second page' }], {
        continueCursor: 'cursor-b',
        pageStatus: 'SplitRequired',
        splitCursor: 'split-second-page',
      }),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'One' }]);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(true);
    expect(fixture.componentInstance.todos.status()).toBe('loadingMore');
    expect(fixture.componentInstance.todos.isSuccess()).toBe(true);
  }));

  it('blocks loadMore after a tail-page error until reset() starts a fresh session', fakeAsync(() => {
    const onError = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
        onError,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(pageResult([{ _id: '1', name: 'One' }], { continueCursor: 'cursor-a' }));

    fixture.componentInstance.todos.loadMore(1);
    const failingPage = latestSubscription();
    const error = new Error('later page failed');
    failingPage.onError(error);

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'One' }]);
    expect(fixture.componentInstance.todos.error()).toBe(error);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(onError).toHaveBeenCalledWith(error);
    expect(fixture.componentInstance.todos.loadMore(1)).toBe(false);

    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    const restartedPage = latestSubscription();
    expect(restartedPage.args.paginationOpts.cursor).toBeNull();
    expect(restartedPage.args.paginationOpts.id).not.toBe(firstPage.args.paginationOpts.id);
    expect(fixture.componentInstance.todos.status()).toBe('loadingFirstPage');
    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));

  it('blocks loadMore after a non-tail page error and preserves only the safe prefix', fakeAsync(() => {
    const onError = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
        onError,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(pageResult([{ _id: '1', name: 'One' }], { continueCursor: 'cursor-a' }));

    expect(fixture.componentInstance.todos.loadMore(1)).toBe(true);
    const secondPage = latestSubscription();
    secondPage.onUpdate(pageResult([{ _id: '2', name: 'Two' }], { continueCursor: 'cursor-b' }));

    expect(fixture.componentInstance.todos.loadMore(1)).toBe(true);
    const thirdPage = latestSubscription();

    const error = new Error('middle page failed');
    secondPage.onError(error);

    expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'One' }]);
    expect(fixture.componentInstance.todos.error()).toBe(error);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(onError).toHaveBeenCalledWith(error);
    expect(fixture.componentInstance.todos.loadMore(1)).toBe(false);
    expect(latestSubscription()).toBe(thirdPage);
  }));

  it('blocks loadMore after a split-child error', fakeAsync(() => {
    const onError = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
        initialNumItems: 1,
        onError,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const firstPage = subscriptions[0];
    firstPage.onUpdate(
      pageResult([{ _id: 'p', name: 'Partial' }], {
        continueCursor: 'cursor-after-split',
        pageStatus: 'SplitRequired',
        splitCursor: 'split-at',
      }),
    );

    const leftSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === null && subscription.args.paginationOpts.endCursor === 'split-at',
    );
    const rightSplit = findSubscription(
      (subscription) =>
        subscription.args.paginationOpts.cursor === 'split-at' &&
        subscription.args.paginationOpts.endCursor === 'cursor-after-split',
    );

    leftSplit.onError(new Error('split child failed'));

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()?.message).toBe('split child failed');
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(fixture.componentInstance.todos.loadMore(1)).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'split child failed' }));

    rightSplit.onUpdate(
      pageResult([{ _id: '2', name: 'Second half' }], {
        continueCursor: 'cursor-after-split',
      }),
    );

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
  }));

  it('supports skipToken transitions and ignores stale callbacks after skipping', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly shouldSkip = signal(false);
      readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => (this.shouldSkip() ? skipToken : {}), {
        initialNumItems: 2,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const activeSubscription = subscriptions[0];
    activeSubscription.onUpdate(pageResult([{ _id: '1', name: 'One' }], { isDone: true }));

    fixture.componentInstance.shouldSkip.set(true);
    fixture.detectChanges();
    tick();

    expect(activeSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
    expect(fixture.componentInstance.todos.results()).toEqual([]);

    activeSubscription.onUpdate(pageResult([{ _id: 'stale', name: 'Stale' }], { isDone: true }));
    activeSubscription.onError(new Error('stale failure'));

    expect(fixture.componentInstance.todos.results()).toEqual([]);
    expect(fixture.componentInstance.todos.error()).toBeUndefined();

    fixture.componentInstance.shouldSkip.set(false);
    fixture.detectChanges();
    tick();

    const resumedSubscription = latestSubscription();
    expect(resumedSubscription.args.paginationOpts.id).not.toBe(activeSubscription.args.paginationOpts.id);
    expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
  }));

  it('supports creation with injectRef outside an injection context and cleans up on injector destroy', fakeAsync(() => {
    const injector = TestBed.inject(EnvironmentInjector);
    const childInjector = createEnvironmentInjector([], injector);

    const todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), {
      initialNumItems: 2,
      injectRef: childInjector,
    });
    tick();

    expect(subscriptions).toHaveLength(1);

    subscriptions[0].onUpdate(pageResult([{ _id: '1', name: 'One' }], { isDone: true }));
    expect(todos.results()).toEqual([{ _id: '1', name: 'One' }]);

    childInjector.destroy();
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  }));
});
