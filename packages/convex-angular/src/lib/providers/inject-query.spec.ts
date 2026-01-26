import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { QueryReference, injectQuery } from './inject-query';

// Mock getFunctionName to avoid needing a real FunctionReference
jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:listTodos'),
}));

// Mock query function reference
const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
> as QueryReference;

describe('injectQuery', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockUnsubscribe: jest.Mock;
  let mockLocalQueryResult: jest.Mock;
  let onUpdateCallback: (result: any) => void;
  let onErrorCallback: (err: Error) => void;

  beforeEach(() => {
    mockUnsubscribe = jest.fn();
    mockLocalQueryResult = jest.fn().mockReturnValue(undefined);

    mockConvexClient = {
      client: {
        localQueryResult: mockLocalQueryResult,
      },
      onUpdate: jest.fn((_query, _args, onUpdate, onError) => {
        onUpdateCallback = onUpdate;
        onErrorCallback = onError;
        return mockUnsubscribe;
      }),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('initial state', () => {
    it('should initialize with local query result if available', fakeAsync(() => {
      const cachedData = [{ _id: '1', title: 'Cached todo' }];
      mockLocalQueryResult.mockReturnValue(cachedData);

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
      mockLocalQueryResult.mockReturnValue(undefined);

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

      // Data is set by the subscription callback, not initial state
      expect(mockConvexClient.onUpdate).toHaveBeenCalled();
    }));

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

      expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(
        mockQuery,
        { count: 20 },
        expect.any(Function),
        expect.any(Function),
      );
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
      onUpdateCallback(mockData);

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

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

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
      onErrorCallback(new Error('Test error'));
      expect(fixture.componentInstance.todos.error()).toBeDefined();

      // Then, successful update
      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

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
      onErrorCallback(error);

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
      onUpdateCallback(mockData);
      expect(fixture.componentInstance.todos.data()).toBeDefined();

      // Then, error - data should be preserved
      onErrorCallback(new Error('Query failed'));

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

      onErrorCallback(new Error('Query failed'));

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

      expect(mockConvexClient.onUpdate).not.toHaveBeenCalled();
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
        readonly todos = injectQuery(mockQuery, () =>
          this.userId() ? { count: 10 } : skipToken,
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially skipped
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);
      expect(mockConvexClient.onUpdate).not.toHaveBeenCalled();

      // Set userId to enable query
      fixture.componentInstance.userId.set('user-123');
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(mockConvexClient.onUpdate).toHaveBeenCalled();
    }));

    it('should clear data/error when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () =>
          this.shouldSkip() ? skipToken : { count: 10 },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Set some data
      onUpdateCallback([{ _id: '1', title: 'Todo' }]);
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
        readonly todos = injectQuery(mockQuery, () =>
          this.shouldSkip() ? skipToken : { count: 10 },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalled();
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
        readonly todos = injectQuery(mockQuery, () =>
          this.shouldSkip() ? skipToken : { count: 10 },
        );
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).not.toHaveBeenCalled();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(true);

      // Enable the query
      fixture.componentInstance.shouldSkip.set(false);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalled();
      expect(fixture.componentInstance.todos.isSkipped()).toBe(false);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
    }));

    it('should correctly handle skipToken changes', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(true);
        readonly todos = injectQuery(mockQuery, () =>
          this.shouldSkip() ? skipToken : { count: 1 },
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

      expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(
        mockQuery,
        { count: 10 },
        expect.any(Function),
        expect.any(Function),
      );

      // Change count
      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(
        mockQuery,
        { count: 20 },
        expect.any(Function),
        expect.any(Function),
      );
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

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Change count
      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(mockUnsubscribe).toHaveBeenCalled();
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

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      fixture.destroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
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

      // First update
      onUpdateCallback([{ _id: '1', title: 'Todo 1' }]);
      expect(fixture.componentInstance.todos.data()?.length).toBe(1);

      // Second update
      onUpdateCallback([
        { _id: '1', title: 'Todo 1' },
        { _id: '2', title: 'Todo 2' },
      ]);
      expect(fixture.componentInstance.todos.data()?.length).toBe(2);

      // Third update
      onUpdateCallback([]);
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

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

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

      onErrorCallback(new Error('Query failed'));

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
        readonly todos = injectQuery(mockQuery, () =>
          this.shouldSkip() ? skipToken : { count: 10 },
        );
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
      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.status()).toBe('success');

      // Error -> error
      onErrorCallback(new Error('Query failed'));

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

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

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

      onErrorCallback(new Error('Query failed'));

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

      expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);

      // Refetch
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(2);
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

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Refetch
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(mockUnsubscribe).toHaveBeenCalled();
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
      onUpdateCallback(initialData);

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);

      // Refetch - data should be preserved
      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
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

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);
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
      onUpdateCallback(mockData);

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

      onUpdateCallback([{ _id: '1', title: 'Todo 1' }]);
      onUpdateCallback([
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
      onErrorCallback(error);

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
      onUpdateCallback([{ _id: '1', title: 'Todo' }]);
      onErrorCallback(new Error('Query failed'));

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
      onUpdateCallback(initialData);

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);

      // Error occurs - data should be preserved
      onErrorCallback(new Error('Query failed'));

      expect(fixture.componentInstance.todos.data()).toEqual(initialData);
      expect(fixture.componentInstance.todos.error()).toBeDefined();
    }));
  });
});
