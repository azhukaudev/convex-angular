import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';
import type { Mock, Mocked } from 'vitest';

import { skipToken } from '../skip-token';
import { CONVEX } from '../tokens/convex';
import { QueryReference, injectQuery } from './inject-query';

// Mock getFunctionName to avoid needing a real FunctionReference
vi.mock('convex/server', async () => ({
  ...(await vi.importActual<typeof import('convex/server')>('convex/server')),
  getFunctionName: vi.fn().mockReturnValue('todos:listTodos'),
}));

// Mock query function reference
const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
> as QueryReference;

describe('injectQuery placeholder and refetch states', () => {
  let mockConvexClient: Mocked<ConvexClient>;
  let mockLocalQueryResult: Mock;
  let onUpdateCallback: (result: any) => void;
  let onErrorCallback: (err: Error) => void;

  beforeEach(() => {
    mockLocalQueryResult = vi.fn().mockReturnValue(undefined);

    mockConvexClient = {
      client: {
        localQueryResult: mockLocalQueryResult,
      },
      onUpdate: vi.fn((_query, _args, onUpdate, onError) => {
        onUpdateCallback = onUpdate;
        onErrorCallback = onError;
        return vi.fn();
      }),
    } as unknown as Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('isRefetching', () => {
    it('should be false during the initial load and after the first result', fakeAsync(() => {
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

      // Initial load: pending but no data yet
      expect(fixture.componentInstance.todos.isLoading()).toBe(true);
      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);

      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
    }));

    it('should be true while resubscribing with preserved data after refetch', fakeAsync(() => {
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

      fixture.componentInstance.todos.refetch();
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toBeDefined();
      expect(fixture.componentInstance.todos.isRefetching()).toBe(true);

      onUpdateCallback([{ _id: '1', title: 'Todo' }]);
      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
    }));

    it('should be true while resubscribing with preserved data after an args change', fakeAsync(() => {
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

      onUpdateCallback([{ _id: '1', title: 'Todo 10' }]);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isRefetching()).toBe(true);
    }));

    it('should be true when seeded from the warm cache while awaiting the live result', fakeAsync(() => {
      mockLocalQueryResult.mockReturnValue([{ _id: '1', title: 'Cached todo' }]);

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

      expect(fixture.componentInstance.todos.isRefetching()).toBe(true);

      onUpdateCallback([{ _id: '1', title: 'Cached todo' }]);
      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
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

      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
    }));
  });

  describe('placeholderData', () => {
    it('should show a static placeholder while the first result loads, without success', fakeAsync(() => {
      const placeholder = [{ _id: 'p', title: 'Placeholder' }];

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: placeholder,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(placeholder);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(true);
      expect(fixture.componentInstance.todos.status()).toBe('pending');
      expect(fixture.componentInstance.todos.isSuccess()).toBe(false);
      expect(fixture.componentInstance.todos.isRefetching()).toBe(false);
    }));

    it('should replace the placeholder with the first live result', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const liveData = [{ _id: '1', title: 'Live todo' }];
      onUpdateCallback(liveData);

      expect(fixture.componentInstance.todos.data()).toEqual(liveData);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
      expect(fixture.componentInstance.todos.status()).toBe('success');
    }));

    it('should clear the placeholder when the query errors', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(true);

      const error = new Error('Query failed');
      onErrorCallback(error);

      // Invented data must never sit next to an error state.
      expect(fixture.componentInstance.todos.data()).toBeUndefined();
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
      expect(fixture.componentInstance.todos.error()).toBe(error);
      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));

    it('should preserve real previous data on error after a placeholder was replaced', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const liveData = [{ _id: '1', title: 'Live todo' }];
      onUpdateCallback(liveData);

      onErrorCallback(new Error('Query failed'));

      expect(fixture.componentInstance.todos.data()).toEqual(liveData);
      expect(fixture.componentInstance.todos.status()).toBe('error');
    }));

    it('should call a placeholder factory with the current args', fakeAsync(() => {
      const placeholderData = vi.fn((args: { count: number }) => [{ _id: 'p', title: `Placeholder ${args.count}` }]);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(placeholderData).toHaveBeenCalledWith({ count: 10 });
      expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'p', title: 'Placeholder 10' }]);
    }));

    it('should prefer the warm cache over the placeholder', fakeAsync(() => {
      const cachedData = [{ _id: '1', title: 'Cached todo' }];
      mockLocalQueryResult.mockReturnValue(cachedData);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(cachedData);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
    }));

    it('should preserve previous real data over the placeholder on args change', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({ count: this.count() }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      const realData = [{ _id: '1', title: 'Todo 10' }];
      onUpdateCallback(realData);

      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual(realData);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
    }));

    it('should re-evaluate a stale placeholder for new args', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly count = signal(10);
        readonly todos = injectQuery(mockQuery, () => ({ count: this.count() }), {
          placeholderData: (args: { count: number }) => [{ _id: 'p', title: `Placeholder ${args.count}` }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'p', title: 'Placeholder 10' }]);

      // Args change before any real result arrives: placeholder is replaced
      fixture.componentInstance.count.set(20);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'p', title: 'Placeholder 20' }]);
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(true);
    }));

    it('should clear the placeholder when transitioning to skipped', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly shouldSkip = signal(false);
        readonly todos = injectQuery(mockQuery, () => (this.shouldSkip() ? skipToken : { count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(true);

      fixture.componentInstance.shouldSkip.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.data()).toBeUndefined();
      expect(fixture.componentInstance.todos.isPlaceholderData()).toBe(false);
    }));

    it('should not fire onSuccess for placeholder data', fakeAsync(() => {
      const onSuccess = vi.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: [{ _id: 'p', title: 'Placeholder' }],
          onSuccess,
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(onSuccess).not.toHaveBeenCalled();

      const liveData = [{ _id: '1', title: 'Live todo' }];
      onUpdateCallback(liveData);
      expect(onSuccess).toHaveBeenCalledWith(liveData);
    }));

    it('should not track signals read inside a placeholder factory', fakeAsync(() => {
      const seed = signal([{ _id: 'p', title: 'Placeholder v1' }]);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), {
          placeholderData: () => seed(),
        });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);

      // Changing the signal read inside the factory must not resubscribe
      seed.set([{ _id: 'p', title: 'Placeholder v2' }]);
      fixture.detectChanges();
      tick();

      expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
    }));
  });
});
