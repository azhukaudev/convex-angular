import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { MutationReference, injectMutation } from './inject-mutation';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

const mockMutation = (() => {}) as unknown as FunctionReference<
  'mutation',
  'public',
  { title: string },
  { id: string }
> as MutationReference;

const mockMutationNoArgs = (() => {}) as unknown as FunctionReference<
  'mutation',
  'public',
  Record<string, never>,
  { id: string }
> as MutationReference;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('injectMutation', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  const ignoreRejection = (promise: Promise<unknown>) => {
    promise.catch(() => undefined);
  };

  beforeEach(() => {
    mockConvexClient = {
      mutation: jest.fn(),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('initial state', () => {
    it('should initialize with undefined data', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.data()).toBeUndefined();
    });

    it('should type data as mutation result or undefined', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      type MutationData = ReturnType<TestComponent['addTodo']['data']>;
      const assertMutationDataType: Assert<
        IsExact<MutationData, { id: string } | undefined>
      > = true;

      const typedData: MutationData = fixture.componentInstance.addTodo.data();

      expect(assertMutationDataType).toBe(true);
      expect(typedData).toBeUndefined();
    });

    it('should initialize with no error', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.error()).toBeUndefined();
    });

    it('should initialize with isLoading false', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    });
  });

  describe('callable invocation', () => {
    it('should set isLoading to true when called', fakeAsync(() => {
      mockConvexClient.mutation.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo({ title: 'test' });

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);
    }));

    it('should set data on successful mutation', fakeAsync(() => {
      const mockResult = { id: '123' };
      mockConvexClient.mutation.mockResolvedValue(mockResult);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual(mockResult);
    }));

    it('should return result from call', fakeAsync(() => {
      const mockResult = { id: '123' };
      mockConvexClient.mutation.mockResolvedValue(mockResult);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.addTodo({ title: 'test' }).then((r) => (result = r));
      tick();

      expect(result).toEqual(mockResult);
    }));

    it('should clear previous data/error before running', fakeAsync(() => {
      const error = new Error('First error');
      mockConvexClient.mutation.mockRejectedValueOnce(error);
      mockConvexClient.mutation.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.error()).toBeDefined();

      fixture.componentInstance.addTodo({ title: 'test2' });

      expect(fixture.componentInstance.addTodo.error()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.data()).toBeUndefined();
    }));

    it('should call convex.mutation with correct arguments', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo({ title: 'Buy groceries' });
      tick();

      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutation,
        { title: 'Buy groceries' },
        { optimisticUpdate: undefined },
      );
    }));

    it('should work with zero-arg mutations', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly clearAll = injectMutation(mockMutationNoArgs);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.clearAll().then((r) => (result = r));
      tick();

      expect(result).toEqual({ id: '123' });
      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutationNoArgs,
        {},
        { optimisticUpdate: undefined },
      );
    }));

    it('should throw on accidental event argument', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      const fakeEvent = {
        bubbles: true,
        persist: () => {},
        isDefaultPrevented: () => false,
      };

      let rejection: Error | undefined;
      fixture.componentInstance.addTodo(fakeEvent as any).catch((e) => (rejection = e));
      tick();

      expect(rejection).toBeInstanceOf(Error);
      expect(rejection?.message).toMatch(/SyntheticEvent/i);
    }));

    it('should throw on accidental DOM event argument', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      const fakeDomEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        target: {},
        type: 'click',
      };

      let rejection: Error | undefined;
      fixture.componentInstance.addTodo(fakeDomEvent as any).catch((e) => (rejection = e));
      tick();

      expect(rejection).toBeInstanceOf(Error);
      expect(rejection?.message).toMatch(/event-like object/i);
    }));
  });

  describe('error handling', () => {
    it('should set error signal on mutation failure', fakeAsync(() => {
      const error = new Error('Mutation failed');
      mockConvexClient.mutation.mockRejectedValue(error);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.error()).toBe(error);
    }));

    it('should convert non-Error objects to Error', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue('string error');

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: unknown;
      fixture.componentInstance.addTodo({ title: 'test' }).catch((error) => (rejection = error));
      tick();

      const error = fixture.componentInstance.addTodo.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
      expect(rejection).toBe(error);
    }));

    it('should reject with the same error stored in state', fakeAsync(() => {
      const failure = new Error('Failed');
      mockConvexClient.mutation.mockRejectedValue(failure);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: unknown;
      fixture.componentInstance.addTodo({ title: 'test' }).catch((error) => (rejection = error));
      tick();

      expect(rejection).toBe(failure);
      expect(fixture.componentInstance.addTodo.error()).toBe(failure);
      expect(fixture.componentInstance.addTodo.status()).toBe('error');
      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
      expect(fixture.componentInstance.addTodo.data()).toBeUndefined();
    }));
  });

  describe('callbacks', () => {
    it('should call onSuccess callback with result', fakeAsync(() => {
      const mockResult = { id: '123' };
      mockConvexClient.mutation.mockResolvedValue(mockResult);
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback on failure', fakeAsync(() => {
      const error = new Error('Mutation failed');
      mockConvexClient.mutation.mockRejectedValue(error);
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should not call onSuccess after component destruction', fakeAsync(() => {
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      fixture.destroy();

      pending.resolve({ id: 'after-destroy' });
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError after component destruction', fakeAsync(() => {
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      fixture.destroy();

      pending.reject(new Error('after destroy'));
      tick();

      expect(onError).not.toHaveBeenCalled();
    }));
  });

  describe('loading states', () => {
    it('should set isLoading to false after success', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));

    it('should set isLoading to false after error', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));
  });

  describe('status signal', () => {
    it('should return idle status initially', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
    });

    it('should return pending status while mutation is running', fakeAsync(() => {
      mockConvexClient.mutation.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo({ title: 'test' });

      expect(fixture.componentInstance.addTodo.status()).toBe('pending');
    }));

    it('should return success status after successful mutation', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.status()).toBe('success');
    }));

    it('should return error status after failed mutation', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.status()).toBe('error');
    }));

    it('should set isSuccess correctly on success', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(true);
    }));

    it('should set isSuccess to false on error', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));

    it('should set isSuccess to false while loading', fakeAsync(() => {
      mockConvexClient.mutation.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo({ title: 'test' });

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset state after success', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: '123' });
      expect(fixture.componentInstance.addTodo.status()).toBe('success');

      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.data()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));

    it('should reset state after error', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));
      tick();

      expect(fixture.componentInstance.addTodo.error()).toBeDefined();
      expect(fixture.componentInstance.addTodo.status()).toBe('error');

      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.error()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
    }));
  });

  describe('concurrent mutations', () => {
    it('should keep only the latest successful result in state', fakeAsync(() => {
      const first = createDeferred<{ id: string }>();
      const second = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValueOnce(first.promise);
      mockConvexClient.mutation.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'first' }));
      ignoreRejection(fixture.componentInstance.addTodo({ title: 'second' }));

      second.resolve({ id: 'second-result' });
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: 'second-result' });
      expect(fixture.componentInstance.addTodo.status()).toBe('success');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);

      first.resolve({ id: 'first-result' });
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: 'second-result' });
      expect(fixture.componentInstance.addTodo.status()).toBe('success');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));

    it('should ignore stale errors when a newer mutation succeeds', fakeAsync(() => {
      const first = createDeferred<{ id: string }>();
      const second = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValueOnce(first.promise);
      mockConvexClient.mutation.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'first' }));
      ignoreRejection(fixture.componentInstance.addTodo({ title: 'second' }));

      second.resolve({ id: 'second-result' });
      tick();

      const firstError = new Error('stale failure');
      first.reject(firstError);

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: 'second-result' });
      expect(fixture.componentInstance.addTodo.status()).toBe('success');
    }));

    it('should let the latest failure win over an older success', fakeAsync(() => {
      const first = createDeferred<{ id: string }>();
      const second = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValueOnce(first.promise);
      mockConvexClient.mutation.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let firstError: Error | undefined;
      fixture.componentInstance.addTodo({ title: 'first' }).catch((e) => (firstError = e));

      let secondError: Error | undefined;
      fixture.componentInstance.addTodo({ title: 'second' }).catch((e) => (secondError = e));

      first.resolve({ id: 'first-result' });
      tick();

      const latestError = new Error('latest failure');
      second.reject(latestError);
      tick();

      expect(firstError).toBe(undefined);
      expect(secondError).toBe(latestError);
      expect(fixture.componentInstance.addTodo.error()).toBe(latestError);
      expect(fixture.componentInstance.addTodo.status()).toBe('error');
      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));

    it('should keep loading tied to the latest mutation only', fakeAsync(() => {
      const first = createDeferred<{ id: string }>();
      const second = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValueOnce(first.promise);
      mockConvexClient.mutation.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'first' }));
      ignoreRejection(fixture.componentInstance.addTodo({ title: 'second' }));

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);

      first.resolve({ id: 'first' });
      tick();

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);

      second.resolve({ id: 'second' });
      tick();

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));

    it('should ignore reset while mutation is running', fakeAsync(() => {
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'test' }));

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);

      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);

      pending.resolve({ id: 'after-reset' });
      tick();

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));
  });

  describe('destroy handling', () => {
    it('should ignore a pending success after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: { id: string } | undefined;
      fixture.componentInstance.addTodo({ title: 'test' }).then((r) => (result = r));

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);

      pending.resolve({ id: 'after-destroy' });
      tick();

      expect(result).toEqual({ id: 'after-destroy' });

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: Error | undefined;
      fixture.componentInstance.addTodo({ title: 'test' }).catch((e) => (rejection = e));

      expect(fixture.componentInstance.addTodo.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);

      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
    }));
  });

  describe('injectRef', () => {
    it('should create a mutation outside an injection context with injectRef', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      const addTodo = injectMutation(mockMutation, { injectRef: injector });

      ignoreRejection(addTodo({ title: 'test' }));
      tick();

      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutation,
        { title: 'test' },
        { optimisticUpdate: undefined },
      );
    }));

    it('should ignore a pending success after the provided injector is destroyed', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], injector);
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);
      const onSuccess = jest.fn();

      const addTodo = injectMutation(mockMutation, { injectRef: childInjector, onSuccess });

      let result: { id: string } | undefined;
      addTodo({ title: 'test' }).then((r) => (result = r));

      expect(addTodo.isLoading()).toBe(true);

      childInjector.destroy();

      expect(addTodo.status()).toBe('idle');
      expect(addTodo.isLoading()).toBe(false);

      pending.resolve({ id: 'after-destroy' });
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'after-destroy' });
    }));

    it('should ignore a pending failure after the provided injector is destroyed', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], injector);
      const pending = createDeferred<{ id: string }>();
      mockConvexClient.mutation.mockReturnValue(pending.promise);
      const onError = jest.fn();

      const addTodo = injectMutation(mockMutation, { injectRef: childInjector, onError });

      let rejection: Error | undefined;
      addTodo({ title: 'test' }).catch((e) => (rejection = e));

      expect(addTodo.isLoading()).toBe(true);

      childInjector.destroy();

      expect(addTodo.status()).toBe('idle');
      expect(addTodo.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);

      expect(addTodo.status()).toBe('idle');
      expect(addTodo.isLoading()).toBe(false);
    }));

    it('should still throw outside an injection context without injectRef', () => {
      TestBed.resetTestingModule();

      expect(() => injectMutation(mockMutation)).toThrow();
    });
  });

  describe('withOptimisticUpdate', () => {
    it('should pass optimistic update to convex.mutation()', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });
      const optimisticUpdate = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
        readonly optimisticAddTodo = this.addTodo.withOptimisticUpdate(optimisticUpdate);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.optimisticAddTodo({ title: 'test' }));
      tick();

      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutation,
        { title: 'test' },
        { optimisticUpdate },
      );
    }));

    it('should have independent state from base helper', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
        readonly optimisticAddTodo = this.addTodo.withOptimisticUpdate(() => {});
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.addTodo({ title: 'first' }));
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: '123' });
      expect(fixture.componentInstance.optimisticAddTodo.data()).toBeUndefined();

      mockConvexClient.mutation.mockResolvedValue({ id: '456' });
      ignoreRejection(fixture.componentInstance.optimisticAddTodo({ title: 'second' }));
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual({ id: '123' });
      expect(fixture.componentInstance.optimisticAddTodo.data()).toEqual({ id: '456' });
    }));

    it('should throw if optimistic update is specified twice', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
        readonly optimisticAddTodo = this.addTodo.withOptimisticUpdate(() => {});
        readonly doubleOptimistic = this.optimisticAddTodo.withOptimisticUpdate(() => {});
      }

      expect(() => {
        TestBed.createComponent(TestComponent);
      }).toThrow(/Already specified optimistic update/i);
    }));

    it('should allow multiple independent optimistic helpers from same base', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
        readonly optimisticAddTodo1 = this.addTodo.withOptimisticUpdate(() => {});
        readonly optimisticAddTodo2 = this.addTodo.withOptimisticUpdate(() => {});
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.optimisticAddTodo1({ title: 'first' }));
      tick();

      expect(fixture.componentInstance.optimisticAddTodo1.data()).toEqual({ id: '123' });
      expect(fixture.componentInstance.optimisticAddTodo2.data()).toBeUndefined();

      mockConvexClient.mutation.mockResolvedValue({ id: '456' });
      ignoreRejection(fixture.componentInstance.optimisticAddTodo2({ title: 'second' }));
      tick();

      expect(fixture.componentInstance.optimisticAddTodo1.data()).toEqual({ id: '123' });
      expect(fixture.componentInstance.optimisticAddTodo2.data()).toEqual({ id: '456' });
    }));
  });
});