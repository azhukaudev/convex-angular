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

const mockAction = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  { message: string },
  { success: boolean }
> as ActionReference;

const mockActionNoArgs = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  Record<string, never>,
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

  describe('callable invocation', () => {
    it('should set isLoading to true when called', fakeAsync(() => {
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

      fixture.componentInstance.sendEmail({ message: 'test' });

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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual(mockResult);
    }));

    it('should return result from call', fakeAsync(() => {
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
      fixture.componentInstance.sendEmail({ message: 'test' }).then((r) => (result = r));
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();

      fixture.componentInstance.sendEmail({ message: 'test2' });

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

      fixture.componentInstance.sendEmail({ message: 'hello' });
      tick();

      expect(mockConvexClient.action).toHaveBeenCalledWith(mockAction, {
        message: 'hello',
      });
    }));

    it('should work with zero-arg actions', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly pingServer = injectAction(mockActionNoArgs);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: unknown;
      fixture.componentInstance.pingServer().then((r) => (result = r));
      tick();

      expect(result).toEqual({ success: true });
      expect(mockConvexClient.action).toHaveBeenCalledWith(mockActionNoArgs, {});
    }));

    it('should throw on accidental event argument', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      const fakeEvent = {
        bubbles: true,
        persist: () => {},
        isDefaultPrevented: () => false,
      };

      let rejection: Error | undefined;
      fixture.componentInstance.sendEmail(fakeEvent as any).catch((e) => (rejection = e));
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
        readonly sendEmail = injectAction(mockAction);
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
      fixture.componentInstance.sendEmail(fakeDomEvent as any).catch((e) => (rejection = e));
      tick();

      expect(rejection).toBeInstanceOf(Error);
      expect(rejection?.message).toMatch(/event-like object/i);
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
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
      fixture.componentInstance.sendEmail({ message: 'test' }).catch((error) => (rejection = error));
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
      fixture.componentInstance.sendEmail({ message: 'test' }).catch((error) => (rejection = error));
      tick();

      expect(rejection).toBe(failure);
      expect(fixture.componentInstance.sendEmail.error()).toBe(failure);
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback on failure', fakeAsync(() => {
      const error = new Error('Action failed');
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should not call onSuccess after component destruction', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      fixture.destroy();

      pending.resolve({ success: true });
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError after component destruction', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      fixture.destroy();

      pending.reject(new Error('after destroy'));
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
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

      fixture.componentInstance.sendEmail({ message: 'test' });

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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
    }));

    it('should set isSuccess correctly on success', fakeAsync(() => {
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

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(true);
    }));

    it('should set isSuccess to false on error', fakeAsync(() => {
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));

    it('should set isSuccess to false while loading', fakeAsync(() => {
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

      fixture.componentInstance.sendEmail({ message: 'test' });

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset state after success', fakeAsync(() => {
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));

    it('should reset state after error', fakeAsync(() => {
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

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
    }));
  });

  describe('concurrent actions', () => {
    it('should keep only the latest successful result in state', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValueOnce(first.promise);
      mockConvexClient.action.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'first' }));
      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'second' }));

      second.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      first.resolve({ success: false });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore stale errors when a newer action succeeds', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValueOnce(first.promise);
      mockConvexClient.action.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'first' }));
      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'second' }));

      second.resolve({ success: true });
      tick();

      const firstError = new Error('stale failure');
      first.reject(firstError);

      expect(fixture.componentInstance.sendEmail.data()).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should let the latest failure win over an older success', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValueOnce(first.promise);
      mockConvexClient.action.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let firstError: Error | undefined;
      fixture.componentInstance.sendEmail({ message: 'first' }).catch((e) => (firstError = e));

      let secondError: Error | undefined;
      fixture.componentInstance.sendEmail({ message: 'second' }).catch((e) => (secondError = e));

      first.resolve({ success: false });
      tick();

      const latestError = new Error('latest failure');
      second.reject(latestError);
      tick();

      expect(firstError).toBe(undefined);
      expect(secondError).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.error()).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should keep loading tied to the latest action only', fakeAsync(() => {
      const first = createDeferred<{ success: boolean }>();
      const second = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValueOnce(first.promise);
      mockConvexClient.action.mockReturnValueOnce(second.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'first' }));
      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'second' }));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      first.resolve({ success: false });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      second.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore reset while action is running', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail({ message: 'test' }));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));
  });

  describe('destroy handling', () => {
    it('should ignore a pending success after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let result: { success: boolean } | undefined;
      fixture.componentInstance.sendEmail({ message: 'test' }).then((r) => (result = r));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: false });
      tick();

      expect(result).toEqual({ success: false });

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the owning component is destroyed', fakeAsync(() => {
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let rejection: Error | undefined;
      fixture.componentInstance.sendEmail({ message: 'test' }).catch((e) => (rejection = e));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);

      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));
  });

  describe('injectRef', () => {
    it('should create an action outside an injection context with injectRef', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      mockConvexClient.action.mockResolvedValue({ success: true });

      const sendEmail = injectAction(mockAction, { injectRef: injector });
      sendEmail({ message: 'test' });

      expect(mockConvexClient.action).toHaveBeenCalledWith(mockAction, {
        message: 'test',
      });
    }));

    it('should ignore a pending success after the provided injector is destroyed', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], injector);
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);
      const onSuccess = jest.fn();

      const sendEmail = injectAction(mockAction, { injectRef: childInjector, onSuccess });

      let result: { success: boolean } | undefined;
      sendEmail({ message: 'test' }).then((r) => (result = r));

      expect(sendEmail.isLoading()).toBe(true);

      childInjector.destroy();

      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);

      pending.resolve({ success: false });
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false });
    }));

    it('should ignore a pending failure after the provided injector is destroyed', fakeAsync(() => {
      const injector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([], injector);
      const pending = createDeferred<{ success: boolean }>();
      mockConvexClient.action.mockReturnValue(pending.promise);
      const onError = jest.fn();

      const sendEmail = injectAction(mockAction, { injectRef: childInjector, onError });

      let rejection: Error | undefined;
      sendEmail({ message: 'test' }).catch((e) => (rejection = e));

      expect(sendEmail.isLoading()).toBe(true);

      childInjector.destroy();

      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      pending.reject(destroyedError);
      tick();

      expect(rejection).toBe(destroyedError);

      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);
    }));

    it('should still throw outside an injection context without injectRef', () => {
      TestBed.resetTestingModule();

      expect(() => injectAction(mockAction)).toThrow();
    });
  });
});