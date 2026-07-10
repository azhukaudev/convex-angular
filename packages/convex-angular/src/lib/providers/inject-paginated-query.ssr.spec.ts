import { Component, PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference, PaginationResult } from 'convex/server';

import { skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { ConvexHydrationState, makeQueryStateKey, serializeQueryArgs, wrapQueryResult } from '../ssr/state-transfer';
import { CONVEX } from '../tokens/convex';
import { PaginatedQueryReference, injectPaginatedQuery } from './inject-paginated-query';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:listTodosPaginated'),
}));

// Mock paginated query function reference
const mockPaginatedQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { paginationOpts: any },
  PaginationResult<{ _id: string; name: string }>
> as PaginatedQueryReference;

describe('injectPaginatedQuery SSR and hydration', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let onUpdateCallback: (result: any) => void;

  beforeEach(() => {
    mockConvexClient = {
      onPaginatedUpdate_experimental: jest.fn((_query, _args, _options, onUpdate) => {
        onUpdateCallback = onUpdate;
        return jest.fn();
      }),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('SSR (server platform)', () => {
    it('stays pending without crashing on a disabled client', fakeAsync(() => {
      TestBed.resetTestingModule();

      // A disabled client's onPaginatedUpdate_experimental registration is a
      // no-op (mirrors ConvexClient behavior on the server platform).
      const noopUnsubscribe = Object.assign(() => undefined, {
        unsubscribe: () => undefined,
        getCurrentValue: () => undefined,
        getQueryLogs: () => undefined,
      });
      const disabledConvexClient = {
        get disabled() {
          return true;
        },
        get client() {
          throw new Error('ConvexClient is disabled');
        },
        onPaginatedUpdate_experimental: jest.fn(() => noopUnsubscribe),
      } as unknown as ConvexClient;

      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'server' },
          { provide: CONVEX, useValue: disabledConvexClient },
        ],
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
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.todos.status()).toBe('pending');
      expect(fixture.componentInstance.todos.isLoadingFirstPage()).toBe(true);
      expect(fixture.componentInstance.todos.results()).toEqual([]);
      expect(fixture.componentInstance.todos.loadMore(10)).toBe(false);
    }));

    describe('first-page server fetching', () => {
      let mockLoader: { enabled: boolean; fetch: jest.Mock };
      let serverConvexClient: ConvexClient;

      function setupServer() {
        TestBed.resetTestingModule();
        serverConvexClient = {
          get disabled() {
            return true;
          },
          onPaginatedUpdate_experimental: jest.fn(),
        } as unknown as ConvexClient;

        TestBed.configureTestingModule({
          providers: [
            { provide: PLATFORM_ID, useValue: 'server' },
            { provide: CONVEX, useValue: serverConvexClient },
            { provide: ConvexServerQueryLoader, useValue: mockLoader },
          ],
        });
      }

      beforeEach(() => {
        mockLoader = {
          enabled: true,
          fetch: jest.fn().mockResolvedValue({
            page: [{ _id: '1', name: 'Server todo' }],
            isDone: false,
            continueCursor: 'cursor-1',
          }),
        };
      });

      it('fetches the first page over the loader and reaches success', fakeAsync(() => {
        setupServer();

        @Component({
          template: '',
          standalone: true,
        })
        class TestComponent {
          readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10 });
        }

        const fixture = TestBed.createComponent(TestComponent);
        fixture.detectChanges();
        tick();

        expect(mockLoader.fetch).toHaveBeenCalledWith(
          mockPaginatedQuery,
          { paginationOpts: { numItems: 10, cursor: null } },
          expect.any(String),
        );
        expect(fixture.componentInstance.todos.status()).toBe('success');
        expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Server todo' }]);
        expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
        expect(fixture.componentInstance.todos.isExhausted()).toBe(false);
        // loadMore is inert until the live subscription syncs in the browser.
        expect(fixture.componentInstance.todos.loadMore(10)).toBe(false);
        expect(serverConvexClient.onPaginatedUpdate_experimental).not.toHaveBeenCalled();
      }));

      it('marks the query exhausted when the first page is the last', fakeAsync(() => {
        mockLoader.fetch.mockResolvedValue({
          page: [{ _id: '1', name: 'Only todo' }],
          isDone: true,
          continueCursor: 'cursor-1',
        });
        setupServer();

        @Component({
          template: '',
          standalone: true,
        })
        class TestComponent {
          readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10 });
        }

        const fixture = TestBed.createComponent(TestComponent);
        fixture.detectChanges();
        tick();

        expect(fixture.componentInstance.todos.isExhausted()).toBe(true);
        expect(fixture.componentInstance.todos.canLoadMore()).toBe(false);
      }));

      it('surfaces server fetch errors', fakeAsync(() => {
        const fetchError = new Error('server fetch failed');
        mockLoader.fetch.mockRejectedValue(fetchError);
        setupServer();

        const onError = jest.fn();

        @Component({
          template: '',
          standalone: true,
        })
        class TestComponent {
          readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10, onError });
        }

        const fixture = TestBed.createComponent(TestComponent);
        fixture.detectChanges();
        tick();

        expect(fixture.componentInstance.todos.status()).toBe('error');
        expect(fixture.componentInstance.todos.error()).toBe(fetchError);
        expect(onError).toHaveBeenCalledWith(fetchError);
      }));

      it('does not fetch for skipped queries', fakeAsync(() => {
        setupServer();

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

        expect(mockLoader.fetch).not.toHaveBeenCalled();
        expect(fixture.componentInstance.todos.status()).toBe('skipped');
      }));
    });
  });

  describe('hydration seeding (browser)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: CONVEX, useValue: mockConvexClient }, ConvexHydrationState],
      });
    });

    it('seeds the transferred first page and lets the live subscription replace it', fakeAsync(() => {
      const transferState = TestBed.inject(TransferState);
      const argsKey = serializeQueryArgs({ paginationOpts: { numItems: 10, cursor: null } });
      transferState.set(
        makeQueryStateKey('todos:listTodosPaginated', argsKey),
        wrapQueryResult({
          page: [{ _id: '1', name: 'Transferred todo' }],
          isDone: false,
          continueCursor: 'cursor-1',
        } as never),
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Seeded before any live update arrives.
      expect(fixture.componentInstance.todos.status()).toBe('success');
      expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Transferred todo' }]);
      expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);

      // The live subscription is still established and replaces the seed.
      tick();
      onUpdateCallback({
        results: [{ _id: '1', name: 'Live todo' }],
        status: 'CanLoadMore',
        loadMore: jest.fn().mockReturnValue(true),
      });

      expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Live todo' }]);
      expect(fixture.componentInstance.todos.loadMore(10)).toBe(true);
    }));

    it('survives the client initial LoadingFirstPage emission until a real update arrives', fakeAsync(() => {
      const transferState = TestBed.inject(TransferState);
      const argsKey = serializeQueryArgs({ paginationOpts: { numItems: 10, cursor: null } });
      transferState.set(
        makeQueryStateKey('todos:listTodosPaginated', argsKey),
        wrapQueryResult({
          page: [{ _id: '1', name: 'Transferred todo' }],
          isDone: false,
          continueCursor: 'cursor-1',
        } as never),
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Seeded before any live update arrives.
      expect(fixture.componentInstance.todos.status()).toBe('success');
      expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Transferred todo' }]);

      // The real client always fires an initial LoadingFirstPage emission for
      // a fresh subscription; it must not clobber the seed.
      tick();
      onUpdateCallback({
        results: [],
        status: 'LoadingFirstPage',
        loadMore: jest.fn().mockReturnValue(false),
      });

      expect(fixture.componentInstance.todos.status()).toBe('success');
      expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Transferred todo' }]);
      expect(fixture.componentInstance.todos.canLoadMore()).toBe(true);
      expect(fixture.componentInstance.todos.loadMore(10)).toBe(false); // still inert

      // A real emission then replaces the seed and re-arms loadMore.
      onUpdateCallback({
        results: [{ _id: '1', name: 'Live todo' }],
        status: 'CanLoadMore',
        loadMore: jest.fn().mockReturnValue(true),
      });
      expect(fixture.componentInstance.todos.results()).toEqual([{ _id: '1', name: 'Live todo' }]);
      expect(fixture.componentInstance.todos.loadMore(10)).toBe(true);
    }));

    it('stays pending when nothing was transferred', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly todos = injectPaginatedQuery(mockPaginatedQuery, () => ({}), { initialNumItems: 10 });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.todos.status()).toBe('pending');
      tick();
    }));
  });
});
