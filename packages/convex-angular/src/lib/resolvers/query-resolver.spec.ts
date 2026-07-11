import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { QueryReference } from '../providers/inject-query';
import { skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { CONVEX } from '../tokens/convex';
import { convexQueryResolver } from './query-resolver';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('users:getProfile'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { userId: string },
  { name: string }
> as QueryReference;

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

describe('convexQueryResolver', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockUnsubscribe: jest.Mock;
  let onUpdateCallback: ((result: unknown) => void) | undefined;
  let onErrorCallback: ((err: Error) => void) | undefined;

  beforeEach(() => {
    mockUnsubscribe = jest.fn();
    onUpdateCallback = undefined;
    onErrorCallback = undefined;

    mockConvexClient = {
      disabled: false,
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

  function runResolver<T>(resolver: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => T): T {
    return TestBed.runInInjectionContext(() => resolver(route, state));
  }

  it('resolves with the first query result', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown;
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(
      mockQuery,
      { userId: 'user-1' },
      expect.any(Function),
      expect.any(Function),
    );

    onUpdateCallback?.({ name: 'Ada' });
    tick();

    expect(resolved).toEqual({ name: 'Ada' });
    tick(5000);
  }));

  it('keeps the subscription warm for the grace period after resolving', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    void Promise.resolve(runResolver(resolver));
    tick();
    onUpdateCallback?.({ name: 'Ada' });
    tick();

    expect(mockUnsubscribe).not.toHaveBeenCalled();

    tick(5000);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  }));

  it('honors a custom keepSubscribedFor', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }), { keepSubscribedFor: 100 });

    void Promise.resolve(runResolver(resolver));
    tick();
    onUpdateCallback?.({ name: 'Ada' });

    tick(99);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    tick(1);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  }));

  it('resolves undefined immediately for skipped queries', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => skipToken);

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    expect(resolved).toBeUndefined();
    expect(mockConvexClient.onUpdate).not.toHaveBeenCalled();
  }));

  it('defaults to empty args when no argsFn is given', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery);

    void Promise.resolve(runResolver(resolver));
    tick();

    expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(mockQuery, {}, expect.any(Function), expect.any(Function));
    onUpdateCallback?.({ name: 'Ada' });
    tick(5000);
  }));

  it('resolves undefined on subscription errors so navigation is never blocked', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    onErrorCallback?.(new Error('boom'));
    tick();

    expect(resolved).toBeUndefined();
    tick(5000);
  }));

  it('does not double-unsubscribe when the keep-warm timer and destroy both fire', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    void Promise.resolve(runResolver(resolver));
    tick();
    onUpdateCallback?.({ name: 'Ada' });
    tick();

    // Let the keep-warm timer fire first.
    tick(5000);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

    // Now simulate the environment being torn down (the second trigger).
    TestBed.resetTestingModule();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  }));

  it('resolves undefined and unsubscribes exactly once when destroyed before any result', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    // Destroy before any result or timeout fires.
    TestBed.resetTestingModule();
    tick();

    expect(resolved).toBeUndefined();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  }));

  it('resolves undefined on a disabled client instead of hanging', fakeAsync(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CONVEX,
          useValue: {
            get disabled() {
              return true;
            },
            onUpdate: jest.fn(),
          } as unknown as ConvexClient,
        },
      ],
    });

    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    expect(resolved).toBeUndefined();
  }));

  describe('SSR (server platform)', () => {
    let mockLoader: { enabled: boolean; fetch: jest.Mock };

    function setupServer(withLoader = true) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'server' },
          {
            provide: CONVEX,
            useValue: {
              get disabled() {
                return true;
              },
              onUpdate: jest.fn(),
            } as unknown as ConvexClient,
          },
          ...(withLoader ? [{ provide: ConvexServerQueryLoader, useValue: mockLoader }] : []),
        ],
      });
    }

    beforeEach(() => {
      mockLoader = {
        enabled: true,
        fetch: jest.fn().mockResolvedValue({ name: 'Server Ada' }),
      };
    });

    it('delegates to the server query loader', fakeAsync(() => {
      setupServer();
      const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

      let resolved: unknown;
      void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
      tick();

      expect(mockLoader.fetch).toHaveBeenCalledWith(mockQuery, { userId: 'user-1' }, '{"userId":"user-1"}');
      expect(resolved).toEqual({ name: 'Server Ada' });
    }));

    it('resolves undefined when the server fetch fails', fakeAsync(() => {
      setupServer();
      mockLoader.fetch.mockRejectedValue(new Error('boom'));
      const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

      let resolved: unknown = 'sentinel';
      void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
      tick();

      expect(resolved).toBeUndefined();
    }));

    it('resolves undefined without a loader', fakeAsync(() => {
      setupServer(false);
      const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

      let resolved: unknown = 'sentinel';
      void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
      tick();

      expect(resolved).toBeUndefined();
    }));
  });
});
