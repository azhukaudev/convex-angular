import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { PrewarmQueryReference, injectPrewarmQuery } from './inject-prewarm-query';

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { userId: string },
  { name: string }
> as PrewarmQueryReference;

describe('injectPrewarmQuery', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let unsubscribeFns: jest.Mock[];
  let errorCallbacks: Array<(err: Error) => void>;

  beforeEach(() => {
    unsubscribeFns = [];
    errorCallbacks = [];

    mockConvexClient = {
      onUpdate: jest.fn((_query, _args, _onUpdate, onError) => {
        errorCallbacks.push(onError);

        const unsubscribe = jest.fn();
        unsubscribeFns.push(unsubscribe);
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

    expect(mockConvexClient.onUpdate).toHaveBeenCalledWith(
      mockQuery,
      { userId: 'user-1' },
      expect.any(Function),
      expect.any(Function),
    );
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

    expect(unsubscribeFns[0]).not.toHaveBeenCalled();

    tick(4_999);
    expect(unsubscribeFns[0]).not.toHaveBeenCalled();

    tick(1);
    expect(unsubscribeFns[0]).toHaveBeenCalledTimes(1);
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
    expect(unsubscribeFns[0]).not.toHaveBeenCalled();

    tick(1);
    expect(unsubscribeFns[0]).toHaveBeenCalledTimes(1);
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
    errorCallbacks[0]?.(error);

    expect(onError).toHaveBeenCalledWith(error, { userId: 'user-1' });
  });

  it('supports injectRef outside the current injection context', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const prewarmUser = injectPrewarmQuery(mockQuery, { injectRef: injector });
    prewarmUser.prewarm({ userId: 'user-1' });

    expect(mockConvexClient.onUpdate).toHaveBeenCalledTimes(1);
  });

  it('cleans up active prewarms when the provided injector is destroyed', () => {
    const childInjector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    const prewarmUser = injectPrewarmQuery(mockQuery, { injectRef: childInjector });
    prewarmUser.prewarm({ userId: 'user-1' });
    prewarmUser.prewarm({ userId: 'user-2' });

    childInjector.destroy();

    expect(unsubscribeFns[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribeFns[1]).toHaveBeenCalledTimes(1);
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

    expect(unsubscribeFns[0]).not.toHaveBeenCalled();

    childInjector.destroy();

    expect(unsubscribeFns[0]).toHaveBeenCalledTimes(1);
  });

  it('throws outside an injection context without injectRef', () => {
    expect(() => injectPrewarmQuery(mockQuery)).toThrow();
  });
});
