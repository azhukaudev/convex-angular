import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference, PaginationResult } from 'convex/server';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { PaginatedQueryReference, injectPaginatedQuery } from './inject-paginated-query';

// Mock paginated query function reference
const mockPaginatedQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { paginationOpts: any },
  PaginationResult<{ _id: string; name: string }>
> as PaginatedQueryReference;

describe('injectPaginatedQuery', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockUnsubscribe: jest.Mock;
  let onUpdateCallback: (result: any) => void;
  let onErrorCallback: (err: Error) => void;

  beforeEach(() => {
    mockUnsubscribe = jest.fn();

    mockConvexClient = {
      onPaginatedUpdate_experimental: jest.fn(
        (_query, _args, _options, onUpdate, onError) => {
          onUpdateCallback = onUpdate;
          onErrorCallback = onError;
          return mockUnsubscribe;
        },
      ),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should initialize with loading state', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
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

  it('should subscribe to paginated query with correct arguments', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({ category: this.category() }),
        () => ({ initialNumItems: 20 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledWith(
      mockPaginatedQuery,
      { category: 'work' },
      { initialNumItems: 20 },
      expect.any(Function),
      expect.any(Function),
    );
  }));

  it('should update signals when LoadingFirstPage status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateCallback({
      results: [],
      status: 'LoadingFirstPage',
      loadMore: jest.fn(),
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
  }));

  it('should update signals when CanLoadMore status is received', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [
      { _id: '1', name: 'Todo 1' },
      { _id: '2', name: 'Todo 2' },
    ];

    onUpdateCallback({
      results: mockItems,
      status: 'CanLoadMore',
      loadMore: jest.fn(),
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
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [{ _id: '1', name: 'Todo 1' }];

    onUpdateCallback({
      results: mockItems,
      status: 'LoadingMore',
      loadMore: jest.fn(),
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
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [
      { _id: '1', name: 'Todo 1' },
      { _id: '2', name: 'Todo 2' },
    ];

    onUpdateCallback({
      results: mockItems,
      status: 'Exhausted',
      loadMore: jest.fn(),
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
    expect(fixture.componentInstance.todos.isExhausted()).toBe(true);
  }));

  it('should call loadMore on the underlying client', fakeAsync(() => {
    const mockLoadMore = jest.fn().mockReturnValue(true);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    onUpdateCallback({
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
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // Don't send any update, so currentLoadMore is undefined
    const result = fixture.componentInstance.todos.loadMore(5);

    expect(result).toBe(false);
  }));

  it('should preserve existing results on error', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    const mockItems = [{ _id: '1', name: 'Todo 1' }];

    // First, load some data
    onUpdateCallback({
      results: mockItems,
      status: 'CanLoadMore',
      loadMore: jest.fn(),
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);

    // Then trigger an error
    const testError = new Error('Test error');
    onErrorCallback(testError);
    fixture.detectChanges();

    // Results should be preserved
    expect(fixture.componentInstance.todos.results()).toEqual(mockItems);
    expect(fixture.componentInstance.todos.error()).toBe(testError);
    expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(false);
    expect(fixture.componentInstance.todos.isLoadingMore()).toBe(false);
    expect(fixture.componentInstance.todos.canLoadMore()).toBe(true); // Allow retry
  }));

  it('should reset pagination when reset() is called', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // Load some data
    onUpdateCallback({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: jest.fn(),
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.results().length).toBe(1);

    // Reset
    fixture.componentInstance.todos.reset();
    fixture.detectChanges();
    tick();

    // Should have called unsubscribe and resubscribed
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledTimes(2);
  }));

  it('should resubscribe when args change', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly category = signal('work');
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({ category: this.category() }),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledTimes(1);

    // Change args
    fixture.componentInstance.category.set('personal');
    fixture.detectChanges();
    tick();

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledTimes(2);
    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenLastCalledWith(
      mockPaginatedQuery,
      { category: 'personal' },
      { initialNumItems: 10 },
      expect.any(Function),
      expect.any(Function),
    );
  }));

  it('should resubscribe when options change', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly pageSize = signal(10);
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: this.pageSize() }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledTimes(1);

    // Change options
    fixture.componentInstance.pageSize.set(20);
    fixture.detectChanges();
    tick();

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenCalledTimes(2);
    expect(
      mockConvexClient.onPaginatedUpdate_experimental,
    ).toHaveBeenLastCalledWith(
      mockPaginatedQuery,
      {},
      { initialNumItems: 20 },
      expect.any(Function),
      expect.any(Function),
    );
  }));

  it('should unsubscribe on component destroy', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    fixture.destroy();

    expect(mockUnsubscribe).toHaveBeenCalled();
  }));

  it('should clear error on successful update', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectPaginatedQuery(
        mockPaginatedQuery,
        () => ({}),
        () => ({ initialNumItems: 10 }),
      );
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    // Trigger an error first
    onErrorCallback(new Error('Test error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.error()).toBeDefined();

    // Then successful update
    onUpdateCallback({
      results: [{ _id: '1', name: 'Todo 1' }],
      status: 'CanLoadMore',
      loadMore: jest.fn(),
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.error()).toBeUndefined();
  }));

  describe('skipToken', () => {
    it('should not subscribe when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).not.toHaveBeenCalled();
    }));

    it('should set isSkipped to true when skipToken is returned', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).not.toHaveBeenCalled();

      // Set category to enable query
      fixture.componentInstance.category.set('work');
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).toHaveBeenCalled();
    }));

    it('should clear results when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => (this.shouldSkip() ? skipToken : {}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Load some data
      onUpdateCallback({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => (this.shouldSkip() ? skipToken : {}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).toHaveBeenCalled();
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Skip the query
      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(mockUnsubscribe).toHaveBeenCalled();
    }));

    it('should resubscribe when transitioning from skipped to active', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => (this.shouldSkip() ? skipToken : {}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).not.toHaveBeenCalled();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);

      // Enable the query
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(
        mockConvexClient.onPaginatedUpdate_experimental,
      ).toHaveBeenCalled();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
    }));

    it('should correctly handle skipToken changes', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => (this.shouldSkip() ? skipToken : {}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(mockConvexClient.onUpdate).not.toHaveBeenCalled();

      for (let i = 0; i < 3; i++) {
        fixture.componentInstance.shouldSkip.set(false);
        fixture.detectChanges();
        tick();
        expect(fixture.componentInstance.todos.isSkipped()).toBe(false);

        fixture.componentInstance.shouldSkip.set(true);
        fixture.detectChanges();
        tick();
        expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      }
    }));

    it('should return false from loadMore when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onUpdateCallback({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onUpdateCallback({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'Exhausted',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onErrorCallback(new Error('Query failed'));
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));

    it('should return skipped status when skipToken is used', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onUpdateCallback({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onErrorCallback(new Error('Query failed'));
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
    }));

    it('should be false when skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => skipToken,
          () => ({ initialNumItems: 10 }),
        );
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10, onSuccess }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const mockResults = [{ _id: '1', name: 'Todo 1' }];
      onUpdateCallback({
        results: mockResults,
        status: 'CanLoadMore',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10, onSuccess }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      onUpdateCallback({
        results: [],
        status: 'LoadingFirstPage',
        loadMore: jest.fn(),
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
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10, onError }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const error = new Error('Query failed');
      onErrorCallback(error);
      fixture.detectChanges();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should work without callbacks', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(
          mockPaginatedQuery,
          () => ({}),
          () => ({ initialNumItems: 10 }),
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Should not throw
      onUpdateCallback({
        results: [{ _id: '1', name: 'Todo 1' }],
        status: 'CanLoadMore',
        loadMore: jest.fn(),
      });
      onErrorCallback(new Error('Query failed'));

      expect(fixture.componentInstance.todos.error()).toBeDefined();
    }));
  });
});
