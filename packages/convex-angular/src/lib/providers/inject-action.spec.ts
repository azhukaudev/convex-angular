import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { ActionReference, injectAction } from './inject-action';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

// Mock action function reference
const mockAction = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  { message: string },
  { success: boolean }
> as ActionReference;

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

describe('injectAction', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  const ignoreRejection = (promise: Promise<unknown>) => {
    promise.catch(() => undefined);
  };

  beforeEach(() => {
    mockConvexClient = {
      action: jest.fn(),
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
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
    });

    it('should type data as action result or undefined', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      type ActionData = ReturnType<TestComponent['sendEmail']['data']>;
      const assertActionDataType: Assert<
        IsExact<ActionData, { success: boolean } | undefined>
      > = true;

      const typedData: ActionData = fixture.componentInstance.sendEmail.data();

      expect(assertActionDataType).toBe(true);
      expect(typedData).toBeUndefined();
    });

    it('should initialize with no error', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
    });

    it('should initialize with isLoading false', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    });
  });

  describe('running actions', () => {
    it('should set isLoading to true when run() is called', fakeAsync(() => {
      mockConvexClient.action.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);
    }));

    it('should set data on successful action', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual(mockResult);
    }));

    it('should return result from run()', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .then((r) => (result = r));
      tick();

      expect(result).toEqual(mockResult);
    }));

    it('should clear previous data/error before running', fakeAsync(() => {
      const error = new Error('First error');
      mockConvexClient.action.mockRejectedValueOnce(error);
      mockConvexClient.action.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // First call - error
      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();

      // Second call - should clear error
      fixture.componentInstance.sendEmail.run({ message: 'test2' });

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
    }));

    it('should call convex.action with correct arguments', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'hello' });
      tick();

      expect(mockConvexClient.action).toHaveBeenCalledWith(mockAction, {
        message: 'hello',
      });
    }));
  });

  describe('error handling', () => {
    it('should set error signal on action failure', fakeAsync(() => {
      const error = new Error('Action failed');
      mockConvexClient.action.mockRejectedValue(error);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBe(error);
    }));

    it('should convert non-Error objects to Error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue('string error');

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch((error) => (rejection = error));
      tick();

      const error = fixture.componentInstance.sendEmail.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
      expect(rejection).toBe(error);
    }));

    it('should reject with the same error stored in state', fakeAsync(() => {
      const failure = new Error('Failed');
      mockConvexClient.action.mockRejectedValue(failure);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch((error) => (rejection = error));
      tick();

      expect(rejection).toBe(failure);
      expect(fixture.componentInstance.sendEmail.error()).toBe(failure);
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
    }));
  });

  describe('callbacks', () => {
    it('should call onSuccess callback with result', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback with error', fakeAsync(() => {
      const error = new Error('Failed');
      mockConvexClient.action.mockRejectedValue(error);
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(onError).toHaveBeenCalledWith(error);
      expect(fixture.componentInstance.sendEmail.error()).toBe(error);
    }));

    it('should not call onSuccess on error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));
      const onSuccess = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError on success', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });
      const onError = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(onError).not.toHaveBeenCalled();
    }));
  });

  describe('loading states', () => {
    it('should set isLoading to false after success', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should set isLoading to false after error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));
  });

  describe('status signal', () => {
    it('should return idle status initially', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
    });

    it('should return pending status while action is running', fakeAsync(() => {
      mockConvexClient.action.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });

      expect(fixture.componentInstance.sendEmail.status()).toBe('pending');
    }));

    it('should return success status after successful action', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should return error status after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
    }));
  });

  describe('isSuccess signal', () => {
    it('should be false initially', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    });

    it('should be false while action is running', fakeAsync(() => {
      mockConvexClient.action.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));

    it('should be true after successful action', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(true);
    }));

    it('should be false after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset all state to initial values', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Run an action
      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toBeDefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');

      // Reset
      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));

    it('should reset error state', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Run a failing action
      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }),
      );
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');

      // Reset
      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
    }));
  });

  describe('overlapping actions', () => {
    it('should keep only the latest successful result in state', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();

      mockConvexClient.action
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let firstResult: unknown;
      let secondResult: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'first' })
        .then((value) => (firstResult = value));
      fixture.componentInstance.sendEmail
        .run({ message: 'second' })
        .then((value) => (secondResult = value));

      second.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
      expect(secondResult).toEqual({ success: true });

      first.resolve({ success: false });
      tick();

      expect(firstResult).toEqual({ success: false });
      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should ignore stale errors when a newer action succeeds', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();

      mockConvexClient.action
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let firstError: unknown;
      let secondResult: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'first' })
        .catch((error) => (firstError = error));
      fixture.componentInstance.sendEmail
        .run({ message: 'second' })
        .then((value) => (secondResult = value));

      second.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(secondResult).toEqual({ success: true });

      const staleError = new Error('stale failure');
      first.reject(staleError);
      tick();

      expect(firstError).toBe(staleError);
      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should let the latest failure win over an older success', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();

      mockConvexClient.action
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let firstResult: unknown;
      let secondError: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'first' })
        .then((value) => (firstResult = value));
      fixture.componentInstance.sendEmail
        .run({ message: 'second' })
        .catch((error) => (secondError = error));

      const latestError = new Error('latest failure');
      second.reject(latestError);
      tick();

      expect(secondError).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.error()).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      first.resolve({ success: true });
      tick();

      expect(firstResult).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.error()).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
    }));

    it('should keep loading tied to the latest action only', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();

      mockConvexClient.action
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'first' });
      fixture.componentInstance.sendEmail.run({ message: 'second' });

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      second.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      first.resolve({ success: false });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore in-flight completions after reset', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValueOnce(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .then((value) => (result = value));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending success after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      const onSuccess = jest.fn();
      mockConvexClient.action.mockReturnValueOnce(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.sendEmail.run({ message: 'test' }).then((value) => (result = value));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      const onError = jest.fn();
      mockConvexClient.action.mockReturnValueOnce(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: unknown;
      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }).catch((error) => (rejection = error)));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);
      expect(onError).not.toHaveBeenCalled();
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));
  });

  describe('injectRef', () => {
    it('should create an action outside an injection context with injectRef', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      mockConvexClient.action.mockResolvedValue({ success: true });

      const sendEmail = injectAction(mockAction, { injectRef: injector });
      sendEmail.run({ message: 'test' });
      tick();

      expect(sendEmail.data()).toEqual({ success: true });
      expect(mockConvexClient.action).toHaveBeenCalledWith(mockAction, {
        message: 'test',
      });
    }));

    it('should ignore a pending success after the provided injector is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      const onSuccess = jest.fn();
      mockConvexClient.action.mockReturnValueOnce(pending.promise);

      const parentInjector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], parentInjector);
      const sendEmail = injectAction(mockAction, { injectRef: childInjector, onSuccess });

      let result: unknown;
      sendEmail.run({ message: 'test' }).then((value) => (result = value));

      expect(sendEmail.isLoading()).toBe(true);

      childInjector.destroy();

      expect(sendEmail.data()).toBeUndefined();
      expect(sendEmail.error()).toBeUndefined();
      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(sendEmail.data()).toBeUndefined();
      expect(sendEmail.error()).toBeUndefined();
      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the provided injector is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      const onError = jest.fn();
      mockConvexClient.action.mockReturnValueOnce(pending.promise);

      const parentInjector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], parentInjector);
      const sendEmail = injectAction(mockAction, { injectRef: childInjector, onError });

      let rejection: unknown;
      ignoreRejection(sendEmail.run({ message: 'test' }).catch((error) => (rejection = error)));

      expect(sendEmail.isLoading()).toBe(true);

      childInjector.destroy();

      expect(sendEmail.error()).toBeUndefined();
      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);
      expect(onError).not.toHaveBeenCalled();
      expect(sendEmail.data()).toBeUndefined();
      expect(sendEmail.error()).toBeUndefined();
      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);
    }));

    it('should still throw outside an injection context without injectRef', () => {
      expect(() => injectAction(mockAction)).toThrow();
    });
  });
});
