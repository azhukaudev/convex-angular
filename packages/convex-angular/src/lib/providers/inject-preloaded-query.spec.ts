import { Component, Signal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FunctionReference } from 'convex/server';

import { injectPreloadedQuery } from './inject-preloaded-query';
import { QueryResult } from './inject-query';

jest.mock('./inject-query', () => ({
  injectQuery: jest.fn(),
}));

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  makeFunctionReference: jest.fn((name: string) => ({ _name: name })),
  getFunctionName: jest.fn((query: { _name?: string }) => query._name ?? 'todos:getOne'),
}));

const { injectQuery } = jest.requireMock('./inject-query') as {
  injectQuery: jest.Mock;
};

const mockQueryRef = { _name: 'todos:getOne' } as unknown as FunctionReference<
  'query',
  'public',
  { id: string },
  { id: string; title: string }
>;

const mismatchedQueryRef = { _name: 'todos:getOther' } as unknown as FunctionReference<
  'query',
  'public',
  { id: string },
  { id: string; title: string }
>;

describe('injectPreloadedQuery', () => {
  function createLiveQueryResult(overrides: Partial<QueryResult<any>> = {}): QueryResult<any> {
    const data = signal<{ id: string; title: string } | undefined>(undefined);
    const error = signal<Error | undefined>(undefined);
    const isLoading = signal(true);
    const isSkipped = signal(false);
    const dataSignal = (overrides.data ?? data.asReadonly()) as Signal<any>;
    const errorSignal = (overrides.error ?? error.asReadonly()) as Signal<any>;
    const isLoadingSignal = (overrides.isLoading ?? isLoading.asReadonly()) as Signal<boolean>;
    const isSkippedSignal = (overrides.isSkipped ?? isSkipped.asReadonly()) as Signal<boolean>;

    return {
      data: dataSignal,
      error: errorSignal,
      isLoading: isLoadingSignal,
      isSkipped: isSkippedSignal,
      isSuccess: overrides.isSuccess ?? computed(() => !isLoadingSignal() && !errorSignal() && !isSkippedSignal()),
      status:
        overrides.status ??
        computed(() => {
          if (isSkippedSignal()) return 'skipped';
          if (isLoadingSignal()) return 'pending';
          if (errorSignal()) return 'error';
          return 'success';
        }),
      refetch: overrides.refetch ?? jest.fn(),
    };
  }

  beforeEach(() => {
    injectQuery.mockReset();
  });

  it('returns preloaded data until the live query resolves', () => {
    const liveQuery = createLiveQueryResult();
    injectQuery.mockReturnValue(liveQuery);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todo.data()).toEqual({ id: '1', title: 'Server todo' });
    expect(fixture.componentInstance.todo.isHydratedFromServer()).toBe(true);
    expect(fixture.componentInstance.todo.liveQuery.status()).toBe('pending');
    expect(injectQuery).toHaveBeenCalledWith(mockQueryRef, expect.any(Function));
  });

  it('prefers live query data once available', () => {
    const liveData = signal<{ id: string; title: string } | undefined>({
      id: '1',
      title: 'Live todo',
    });
    injectQuery.mockReturnValue(
      createLiveQueryResult({
        data: liveData.asReadonly(),
        isLoading: signal(false).asReadonly(),
      }),
    );

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todo.data()).toEqual({ id: '1', title: 'Live todo' });
    expect(fixture.componentInstance.todo.isHydratedFromServer()).toBe(false);
  });

  it('exposes the preloaded payload separately from live query state', () => {
    const refetch = jest.fn();
    injectQuery.mockReturnValue(createLiveQueryResult({ refetch }));

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todo.preloadedData()).toEqual({
      id: '1',
      title: 'Server todo',
    });
    expect(fixture.componentInstance.todo.liveQuery.refetch).toBe(refetch);
  });

  it('throws for mismatched query references', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mismatchedQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/does not match/i);
  });

  it('throws focused errors for malformed args JSON', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{bad json',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/malformed _argsJSON/i);
  });

  it('throws focused errors for malformed value JSON', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{bad json',
      });
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/malformed _valueJSON/i);
  });

  it('can expose preloaded data while the live query is in an error state', () => {
    const error = signal(new Error('live query failed'));
    injectQuery.mockReturnValue(
      createLiveQueryResult({
        error: error.asReadonly(),
        isLoading: signal(false).asReadonly(),
      }),
    );

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly todo = injectPreloadedQuery(mockQueryRef, {
        _name: 'todos:getOne',
        _argsJSON: '{"id":"1"}',
        _valueJSON: '{"id":"1","title":"Server todo"}',
      });
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.todo.data()).toEqual({ id: '1', title: 'Server todo' });
    expect(fixture.componentInstance.todo.liveQuery.status()).toBe('error');
    expect(fixture.componentInstance.todo.liveQuery.error()?.message).toBe('live query failed');
  });
});
