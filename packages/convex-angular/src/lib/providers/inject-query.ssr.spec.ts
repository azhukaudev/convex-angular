import { Component, PLATFORM_ID, TransferState, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';
import type { Mock, Mocked } from 'vitest';

import { skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { ConvexHydrationState, makeQueryStateKey, wrapQueryResult } from '../ssr/state-transfer';
import { CONVEX } from '../tokens/convex';
import { QueryReference, injectQuery } from './inject-query';

// Mock getFunctionName to avoid needing a real FunctionReference
vi.mock('convex/server', async () => ({
  ...(await vi.importActual<typeof import('convex/server')>('convex/server')),
  getFunctionName: vi.fn().mockReturnValue('todos:listTodos'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
> as QueryReference;

describe('injectQuery SSR (server platform)', () => {
  let mockLoader: { enabled: boolean; fetch: Mock };
  let serverConvexClient: ConvexClient;

  function setupServer(options: { withLoader?: boolean } = {}) {
    serverConvexClient = {
      get disabled() {
        return true;
      },
      get client() {
        throw new Error('ConvexClient is disabled');
      },
      onUpdate: vi.fn(),
    } as unknown as ConvexClient;

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CONVEX, useValue: serverConvexClient },
        ...(options.withLoader === false ? [] : [{ provide: ConvexServerQueryLoader, useValue: mockLoader }]),
      ],
    });
  }

  beforeEach(() => {
    mockLoader = {
      enabled: true,
      fetch: vi.fn().mockResolvedValue([{ _id: '1', title: 'Server todo' }]),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should fetch over the loader and reach success without subscribing', fakeAsync(() => {
    setupServer();

    const onSuccess = vi.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), { onSuccess });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.todos.status()).toBe('pending');

    tick();

    expect(mockLoader.fetch).toHaveBeenCalledWith(mockQuery, { count: 10 }, '{"count":10}');
    expect(fixture.componentInstance.todos.status()).toBe('success');
    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: '1', title: 'Server todo' }]);
    expect(onSuccess).toHaveBeenCalledWith([{ _id: '1', title: 'Server todo' }]);
    expect(serverConvexClient.onUpdate).not.toHaveBeenCalled();
  }));

  it('should surface server fetch errors', fakeAsync(() => {
    setupServer();
    const fetchError = new Error('server fetch failed');
    mockLoader.fetch.mockRejectedValue(fetchError);
    const onError = vi.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: 10 }), { onError });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.todos.status()).toBe('error');
    expect(fixture.componentInstance.todos.error()).toBe(fetchError);
    expect(onError).toHaveBeenCalledWith(fetchError);
  }));

  it('should not fetch for skipped queries', fakeAsync(() => {
    setupServer();

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

    expect(mockLoader.fetch).not.toHaveBeenCalled();
    expect(fixture.componentInstance.todos.status()).toBe('skipped');
  }));

  it('should stay pending without crashing when no loader is provided', fakeAsync(() => {
    setupServer({ withLoader: false });

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

  it('should stay pending when server fetching is disabled', fakeAsync(() => {
    setupServer();
    mockLoader.enabled = false;

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

    expect(mockLoader.fetch).not.toHaveBeenCalled();
    expect(fixture.componentInstance.todos.status()).toBe('pending');
  }));

  it('should drop stale results when args change mid-fetch', fakeAsync(() => {
    setupServer();
    const resolvers = new Map<string, (value: unknown) => void>();
    mockLoader.fetch.mockImplementation(
      (_query, _args, argsKey: string) =>
        new Promise((resolve) => {
          resolvers.set(argsKey, resolve);
        }),
    );

    const count = signal(10);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: count() }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    count.set(20);
    fixture.detectChanges();
    tick();

    // The stale first fetch resolves after the args changed.
    resolvers.get('{"count":10}')?.([{ _id: 'stale', title: 'Stale' }]);
    tick();
    expect(fixture.componentInstance.todos.status()).toBe('pending');
    expect(fixture.componentInstance.todos.data()).toBeUndefined();

    resolvers.get('{"count":20}')?.([{ _id: 'fresh', title: 'Fresh' }]);
    tick();
    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'fresh', title: 'Fresh' }]);
  }));
});

describe('injectQuery hydration seeding (browser)', () => {
  let mockConvexClient: Mocked<ConvexClient>;
  let mockLocalQueryResult: Mock;
  let onUpdateCallback: (result: unknown) => void;

  function seedTransferState(argsKey: string, value: unknown) {
    const transferState = TestBed.inject(TransferState);
    transferState.set(makeQueryStateKey('todos:listTodos', argsKey), wrapQueryResult(value as never));
  }

  beforeEach(() => {
    mockLocalQueryResult = vi.fn().mockReturnValue(undefined);

    mockConvexClient = {
      client: {
        localQueryResult: mockLocalQueryResult,
      },
      onUpdate: vi.fn((_query, _args, onUpdate) => {
        onUpdateCallback = onUpdate;
        return vi.fn();
      }),
    } as unknown as Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }, ConvexHydrationState],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should seed transferred data with immediate success status', fakeAsync(() => {
    seedTransferState('{"count":10}', [{ _id: '1', title: 'Transferred todo' }]);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    // Seeded before any subscription update arrives.
    expect(fixture.componentInstance.todos.status()).toBe('success');
    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: '1', title: 'Transferred todo' }]);

    // The live subscription is still established.
    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
    tick();
  }));

  it('should let live updates overwrite seeded data', fakeAsync(() => {
    seedTransferState('{"count":10}', [{ _id: '1', title: 'Transferred todo' }]);

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

    onUpdateCallback([{ _id: '1', title: 'Live todo' }]);

    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: '1', title: 'Live todo' }]);
    expect(fixture.componentInstance.todos.status()).toBe('success');
  }));

  it('should prefer the warm client cache over transferred data', fakeAsync(() => {
    seedTransferState('{"count":10}', [{ _id: 'transferred', title: 'Transferred' }]);
    mockLocalQueryResult.mockReturnValue([{ _id: 'warm', title: 'Warm cache' }]);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.data()).toEqual([{ _id: 'warm', title: 'Warm cache' }]);
    tick();
  }));

  it('should stay pending when nothing was transferred', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todos = injectQuery(mockQuery, () => ({ count: 10 }));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todos.status()).toBe('pending');
    tick();
  }));
});
