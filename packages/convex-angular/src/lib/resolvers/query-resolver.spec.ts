import { Component, DestroyRef, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { QueryReference } from '../providers/inject-query';
import { skipToken } from '../skip-token';
import { ConvexServerQueryLoader } from '../ssr/server-query-loader';
import { convexQueryResolver } from './query-resolver';

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
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

function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

// The resolver runs in the route environment injector, which outlives every
// navigation; count the destroy hooks that stay registered on it.
function trackLiveDestroyHooks(): { live: () => number } {
  const destroyRef = TestBed.inject(DestroyRef);
  const original = destroyRef.onDestroy.bind(destroyRef);
  let live = 0;
  jest.spyOn(destroyRef, 'onDestroy').mockImplementation((callback: () => void) => {
    live += 1;
    const unregister = original(callback);
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        live -= 1;
      }
      unregister();
    };
  });
  return { live: () => live };
}

describe('convexQueryResolver', () => {
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

  function runResolver<T>(resolver: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => T): T {
    return TestBed.runInInjectionContext(() => resolver(route, state));
  }

  it('resolves with the first query result', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown;
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    expect(convex.querySubscriptions).toHaveLength(1);
    expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
    expect(requireLastQuerySubscription(convex).args).toEqual({ userId: 'user-1' });

    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick();

    expect(resolved).toEqual({ name: 'Ada' });
    tick(5000);
  }));

  it('keeps the subscription warm for the grace period after resolving', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    void Promise.resolve(runResolver(resolver));
    tick();
    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick();

    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    tick(5000);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
  }));

  it('honors a custom keepSubscribedFor', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }), { keepSubscribedFor: 100 });

    void Promise.resolve(runResolver(resolver));
    tick();
    requireLastQuerySubscription(convex).emit({ name: 'Ada' });

    tick(99);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);
    tick(1);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
  }));

  it('starts the keep-warm window at the first result, not at subscribe time', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown;
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));

    // The first result arrives well after the default 5000ms window would have expired.
    tick(6000);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick();

    expect(resolved).toEqual({ name: 'Ada' });
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    tick(4999);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    tick(1);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
  }));

  // Pins current behavior: the first outcome of either kind arms the keep-warm
  // timer, so a failed subscription is also released keepSubscribedFor later.
  it('releases a failed subscription keepSubscribedFor after the error', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick(1000);

    requireLastQuerySubscription(convex).emitError(new Error('boom'));
    tick();

    expect(resolved).toBeUndefined();
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    tick(4999);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);

    tick(1);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
  }));

  it('resolves undefined immediately for skipped queries', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => skipToken);

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    expect(resolved).toBeUndefined();
    expect(convex.querySubscriptions).toHaveLength(0);
  }));

  it('defaults to empty args when no argsFn is given', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery);

    void Promise.resolve(runResolver(resolver));
    tick();

    expect(convex.querySubscriptions).toHaveLength(1);
    expect(requireLastQuerySubscription(convex).query).toBe(mockQuery);
    expect(requireLastQuerySubscription(convex).args).toEqual({});
    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick(5000);
  }));

  it('resolves undefined on subscription errors so navigation is never blocked', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    requireLastQuerySubscription(convex).emitError(new Error('boom'));
    tick();

    expect(resolved).toBeUndefined();
    tick(5000);
  }));

  it('does not double-unsubscribe when the keep-warm timer and destroy both fire', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    void Promise.resolve(runResolver(resolver));
    tick();
    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick();

    // Let the keep-warm timer fire first.
    tick(5000);
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);

    // Tearing the environment down afterwards must not unsubscribe again: whichever
    // trigger fires first removes the destroy hook or clears the timer for the other.
    TestBed.resetTestingModule();

    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
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
    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
    // A scope destroyed before the first result has nothing to keep warm, so
    // it must not schedule a keep-warm timer on its way out. `flush` reports
    // the virtual time it had to advance to drain the queue: zero means the
    // resolver left no pending work behind.
    expect(flush()).toBe(0);
  }));

  it('resolves undefined without subscribing when its scope is already destroyed', fakeAsync(() => {
    @Component({ template: '', standalone: true })
    class HostComponent {}

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const scopeInjector = fixture.componentRef.injector;
    fixture.destroy();

    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runInInjectionContext(scopeInjector, () => resolver(route, state))).then(
      (value) => (resolved = value),
    );
    tick();

    expect(resolved).toBeUndefined();
    expect(convex.querySubscriptions).toHaveLength(0);
    expect(flush()).toBe(0);
  }));

  it('keeps a single keep-warm timer when further results arrive', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    let resolved: unknown = 'sentinel';
    void Promise.resolve(runResolver(resolver)).then((value) => (resolved = value));
    tick();

    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick(1000);
    // Live updates keep flowing while the subscription is warm; they must not
    // re-resolve the navigation or stack up another keep-warm timer.
    requireLastQuerySubscription(convex).emit({ name: 'Ada Lovelace' });
    tick(1000);

    expect(resolved).toEqual({ name: 'Ada' });

    TestBed.resetTestingModule();
    tick();

    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(1);
    expect(flush()).toBe(0);
  }));

  it('leaves no destroy hook behind after repeated resolves past the keep-warm window', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));
    const hooks = trackLiveDestroyHooks();

    for (let i = 0; i < 10; i++) {
      void Promise.resolve(runResolver(resolver));
      tick();
      requireLastQuerySubscription(convex).emit({ name: 'Ada' });
      tick();
      tick(5000);
    }

    expect(hooks.live()).toBe(0);
  }));

  it('holds its destroy hook while the subscription is warm and releases it with the timer', fakeAsync(() => {
    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));
    const hooks = trackLiveDestroyHooks();

    void Promise.resolve(runResolver(resolver));
    tick();
    requireLastQuerySubscription(convex).emit({ name: 'Ada' });
    tick(1000);

    expect(hooks.live()).toBe(1);

    tick(4000);

    expect(hooks.live()).toBe(0);
  }));

  it('throws the guided setup error when provideConvex was never called', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const resolver = convexQueryResolver(mockQuery, () => ({ userId: 'user-1' }));

    expect(() => runResolver(resolver)).toThrow('Could not find `CONVEX`. Make sure to call `provideConvex(...)`');
  });

  it('resolves undefined on a disabled client instead of hanging', fakeAsync(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideConvexTesting(new MockConvexClient({ disabled: true }))],
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
          provideConvexTesting(new MockConvexClient({ disabled: true })),
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
