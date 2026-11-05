import { DestroyRef, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { WarmSubscription, openWarmSubscription } from './warm-subscription';

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('users:getProfile'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<'query', 'public', { userId: string }, { name: string }>;

function requireLastQuerySubscription(convex: MockConvexClient): MockQuerySubscription {
  const subscription = convex.lastQuerySubscription();
  if (!subscription) {
    throw new Error('Expected a captured query subscription');
  }
  return subscription;
}

// Count the destroy hooks that stay registered on the owning scope.
function trackLiveDestroyHooks(destroyRef: DestroyRef): { live: () => number } {
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

describe('openWarmSubscription', () => {
  let convex: MockConvexClient;
  let destroyRef: DestroyRef;
  let onValue: jest.Mock<void, [{ name: string }]>;
  let onError: jest.Mock<void, [Error]>;
  let onRelease: jest.Mock<void, []>;

  beforeEach(() => {
    convex = new MockConvexClient();
    TestBed.configureTestingModule({ providers: [provideConvexTesting(convex)] });
    destroyRef = TestBed.inject(DestroyRef);
    onValue = jest.fn();
    onError = jest.fn();
    onRelease = jest.fn();
  });

  function open(): WarmSubscription {
    return openWarmSubscription(TestBed.inject(CONVEX), mockQuery, { userId: 'user-1' }, destroyRef, {
      onValue,
      onError,
      onRelease,
    });
  }

  it('forwards values and errors from the client to the handlers', () => {
    open();
    const subscription = requireLastQuerySubscription(convex);

    subscription.emit({ name: 'Ada' });
    subscription.emitError(new Error('boom'));

    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith({ name: 'Ada' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(new Error('boom'));
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('releases once however many times release is called', () => {
    const warm = open();
    const subscription = requireLastQuerySubscription(convex);

    warm.release();
    warm.release();

    expect(subscription.unsubscribeCount).toBe(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps the subscription open until released', () => {
    open();

    expect(requireLastQuerySubscription(convex).unsubscribeCount).toBe(0);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('releases when the releaseAfter deadline passes', fakeAsync(() => {
    open().releaseAfter(1000);
    const subscription = requireLastQuerySubscription(convex);

    tick(999);

    expect(onRelease).not.toHaveBeenCalled();

    tick(1);

    expect(subscription.unsubscribeCount).toBe(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('arms the releaseAfter timer only once, so the first deadline wins', fakeAsync(() => {
    const warm = open();
    warm.releaseAfter(1000);
    warm.releaseAfter(100);

    tick(500);

    expect(onRelease).not.toHaveBeenCalled();

    tick(500);

    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('caps an Infinity delay at the largest timer delay instead of firing immediately', fakeAsync(() => {
    open().releaseAfter(Infinity);

    tick(2_147_483_646);
    expect(onRelease).not.toHaveBeenCalled();

    tick(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('caps a finite delay above the timer limit at the limit', fakeAsync(() => {
    open().releaseAfter(2 ** 31);

    tick(2_147_483_646);
    expect(onRelease).not.toHaveBeenCalled();

    tick(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('does not arm a timer after release', fakeAsync(() => {
    const warm = open();
    warm.release();

    // A timer armed after release would still be pending when fakeAsync
    // checks for leftovers at the end of the test.
    warm.releaseAfter(1000);
  }));

  it('cancels the pending timer when released early', fakeAsync(() => {
    const warm = open();
    const subscription = requireLastQuerySubscription(convex);
    warm.releaseAfter(1000);

    warm.release();

    // The released flag alone would make a stale timer a harmless no-op, so
    // assert the timer itself is gone: `flush` returns the virtual time it had
    // to advance, and zero means nothing was left pending.
    expect(flush()).toBe(0);
    expect(subscription.unsubscribeCount).toBe(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('releases when the owning scope is destroyed', () => {
    open();
    const subscription = requireLastQuerySubscription(convex);

    TestBed.resetTestingModule();

    expect(subscription.unsubscribeCount).toBe(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('releases once when the scope is destroyed after the deadline released it', fakeAsync(() => {
    open().releaseAfter(1000);
    const subscription = requireLastQuerySubscription(convex);

    tick(1000);
    TestBed.resetTestingModule();

    expect(subscription.unsubscribeCount).toBe(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  }));

  it('holds its destroy hook until released, then drops it', () => {
    const hooks = trackLiveDestroyHooks(destroyRef);
    const warm = open();

    expect(hooks.live()).toBe(1);

    warm.release();

    expect(hooks.live()).toBe(0);
  });

  it('drops its destroy hook when the deadline releases it', fakeAsync(() => {
    const hooks = trackLiveDestroyHooks(destroyRef);
    open().releaseAfter(1000);

    expect(hooks.live()).toBe(1);

    tick(1000);

    expect(hooks.live()).toBe(0);
  }));

  describe('on an already-destroyed scope', () => {
    function destroyedScopeRef(): DestroyRef {
      const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
      const scopeRef = scope.get(DestroyRef);
      scope.destroy();
      return scopeRef;
    }

    function openOn(scopeRef: DestroyRef): WarmSubscription {
      return openWarmSubscription(TestBed.inject(CONVEX), mockQuery, { userId: 'user-1' }, scopeRef, {
        onValue,
        onError,
        onRelease,
      });
    }

    it('does not throw, opens no subscription, and releases synchronously', () => {
      expect(() => openOn(destroyedScopeRef())).not.toThrow();

      expect(convex.querySubscriptions).toHaveLength(0);
      expect(onRelease).toHaveBeenCalledTimes(1);
      expect(onValue).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('returns an inert handle that never releases again or arms a timer', fakeAsync(() => {
      const warm = openOn(destroyedScopeRef());

      warm.release();
      warm.releaseAfter(1000);

      expect(onRelease).toHaveBeenCalledTimes(1);
      // `flush` reports the virtual time it had to advance: 0 means no timer was armed.
      expect(flush()).toBe(0);
    }));

    it('does not register a destroy hook', () => {
      const scopeRef = destroyedScopeRef();
      const onDestroy = jest.spyOn(scopeRef, 'onDestroy');

      openOn(scopeRef);

      expect(onDestroy).not.toHaveBeenCalled();
    });
  });
});
