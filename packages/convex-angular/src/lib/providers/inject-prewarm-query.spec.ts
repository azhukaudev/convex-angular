import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockConvexClient, MockQuerySubscription, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { PrewarmQueryReference, injectPrewarmQuery } from './inject-prewarm-query';

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { userId: string },
  { name: string }
> as PrewarmQueryReference;

function requireQuerySubscription(convex: MockConvexClient, index: number): MockQuerySubscription {
  const subscription = convex.querySubscriptions[index];
  if (!subscription) {
    throw new Error(`Expected a captured query subscription at index ${index}`);
  }
  return subscription;
}

describe('injectPrewarmQuery', () => {
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

  it('subscribes with the provided query and args', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery);
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });

    expect(convex.querySubscriptions).toHaveLength(1);
    expect(requireQuerySubscription(convex, 0).query).toBe(mockQuery);
    expect(requireQuerySubscription(convex, 0).args).toEqual({ userId: 'user-1' });
  });

  it('unsubscribes after the default timeout', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery);
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(0);

    tick(4_999);
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(0);

    tick(1);
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
  }));

  it('respects a custom extendSubscriptionFor timeout', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery, {
        extendSubscriptionFor: 250,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });

    tick(249);
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(0);

    tick(1);
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
  }));

  it('forwards subscription errors to onError', () => {
    const onError = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery, { onError });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });

    const error = new Error('Prefetch failed');
    requireQuerySubscription(convex, 0).emitError(error);

    expect(onError).toHaveBeenCalledWith(error, { userId: 'user-1' });
  });

  it('releases a subscription only once when it fails after the window expired', fakeAsync(() => {
    const onError = jest.fn();

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery, { onError });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    let warmed: boolean | undefined;
    void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
      warmed = result;
    });

    tick(5_000);
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);

    // A failure reported after the prewarm was already released must not
    // unsubscribe a second time. A real client could never call a retired
    // callback, so invoke it directly to reach that guard.
    const error = new Error('late failure');
    requireQuerySubscription(convex, 0).emitErrorAfterUnsubscribe(error);
    tick();

    expect(onError).toHaveBeenCalledWith(error, { userId: 'user-1' });
    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
    expect(warmed).toBe(false);
  }));

  it('releases a subscription only once when it fails after the scope was destroyed', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery);
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });
    fixture.destroy();

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);

    requireQuerySubscription(convex, 0).emitErrorAfterUnsubscribe(new Error('late failure'));
    tick();

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
  }));

  it('supports injectRef outside the current injection context', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const prewarmUser = injectPrewarmQuery(mockQuery, { injectRef: injector });
    prewarmUser.prewarm({ userId: 'user-1' });

    expect(convex.querySubscriptions).toHaveLength(1);
  });

  it('cleans up active prewarms when the provided injector is destroyed', () => {
    const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    const prewarmUser = injectPrewarmQuery(mockQuery, { injectRef: childInjector });
    prewarmUser.prewarm({ userId: 'user-1' });
    prewarmUser.prewarm({ userId: 'user-2' });

    childInjector.destroy();

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
    expect(requireQuerySubscription(convex, 1).unsubscribeCount).toBe(1);
  });

  it('lets injectRef override the ambient component scope', () => {
    const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery, {
        injectRef: childInjector,
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' });
    fixture.destroy();

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(0);

    childInjector.destroy();

    expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
  });

  it('throws outside an injection context without injectRef', () => {
    expect(() => injectPrewarmQuery(mockQuery)).toThrow();
  });

  describe('prewarm feedback promise', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly prewarmUser = injectPrewarmQuery(mockQuery);
    }

    it('resolves true once the warm subscription receives its first result', fakeAsync(() => {
      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });

      requireQuerySubscription(convex, 0).emit({ name: 'Ada' });
      tick();

      expect(warmed).toBe(true);
    }));

    it('resolves false when the subscription fails before a result arrives', fakeAsync(() => {
      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });

      requireQuerySubscription(convex, 0).emitError(new Error('subscription failed'));
      tick();

      expect(warmed).toBe(false);
      // A failed subscription is released immediately, not at expiry.
      expect(requireQuerySubscription(convex, 0).unsubscribeCount).toBe(1);
    }));

    it('resolves false when the subscription expires before a result arrives', fakeAsync(() => {
      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });

      tick(5_000);

      expect(warmed).toBe(false);
    }));

    it('stays true when the subscription expires after a result arrived', fakeAsync(() => {
      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });

      requireQuerySubscription(convex, 0).emit({ name: 'Ada' });
      tick(5_000);

      expect(warmed).toBe(true);
    }));

    it('resolves false when the owning scope is destroyed before a result arrives', fakeAsync(() => {
      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });

      fixture.destroy();
      tick();

      expect(warmed).toBe(false);
    }));
  });

  describe('disabled client (SSR)', () => {
    let disabledConvex: MockConvexClient;

    beforeEach(() => {
      TestBed.resetTestingModule();
      disabledConvex = new MockConvexClient({ disabled: true });

      TestBed.configureTestingModule({
        providers: [provideConvexTesting(disabledConvex)],
      });
    });

    it('makes prewarm a no-op so SSR stability is not delayed by timers', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly prewarmUser = injectPrewarmQuery(mockQuery);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let warmed: boolean | undefined;
      void fixture.componentInstance.prewarmUser.prewarm({ userId: 'user-1' }).then((result) => {
        warmed = result;
      });
      tick();

      // The subscription and its cleanup timer are created in the same guarded
      // path, so never reaching the client means no timer was scheduled either.
      // A disabled client records the attempt it refused, which is what proves
      // the helper did not make one.
      expect(disabledConvex.refusedSubscriptions).toHaveLength(0);
      expect(warmed).toBe(false);
    }));
  });
});
