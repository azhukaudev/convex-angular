import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MockCallableCall, MockConvexClient, provideConvexTesting } from 'convex-angular/testing';
import { FunctionReference } from 'convex/server';

import { ActionReference, injectAction } from './inject-action';

type Assert<T extends true> = T;
type IsExact<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

// Mock action function reference
const mockAction = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  { message: string },
  { success: boolean }
> as ActionReference;

function requireCall(calls: readonly MockCallableCall[], index = calls.length - 1): MockCallableCall {
  const call = calls[index];
  if (!call) {
    throw new Error(`Expected a captured action call at index ${index}`);
  }
  return call;
}

describe('injectAction', () => {
  let convex: MockConvexClient;
  const ignoreRejection = (promise: Promise<unknown>) => {
    promise.catch(() => undefined);
  };

  beforeEach(() => {
    convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex)],
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
      const assertActionDataType: Assert<IsExact<ActionData, { success: boolean } | undefined>> = true;

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
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Left unsettled: the captured call only completes when the test settles it.
      fixture.componentInstance.sendEmail.run({ message: 'test' });

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);
    }));

    it('should set data on successful action', fakeAsync(() => {
      const mockResult = { success: true };

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve(mockResult);
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual(mockResult);
    }));

    it('should return result from run()', fakeAsync(() => {
      const mockResult = { success: true };

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
      fixture.componentInstance.sendEmail.run({ message: 'test' }).then((r) => (result = r));
      requireCall(convex.actionCalls).resolve(mockResult);
      tick();

      expect(result).toEqual(mockResult);
    }));

    it('should clear previous data/error before running', fakeAsync(() => {
      const error = new Error('First error');

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
      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(error);
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();

      // Second call - should clear error
      fixture.componentInstance.sendEmail.run({ message: 'test2' });

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
    }));

    it('should call convex.action with correct arguments', fakeAsync(() => {
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
      const call = requireCall(convex.actionCalls);
      call.resolve({ success: true });
      tick();

      expect(convex.actionCalls).toHaveLength(1);
      expect(call.fn).toBe(mockAction);
      expect(call.args).toEqual({ message: 'hello' });
      // injectAction passes no options object at all.
      expect(call.options).toBeUndefined();
    }));
  });

  describe('error handling', () => {
    it('should set error signal on action failure', fakeAsync(() => {
      const error = new Error('Action failed');

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(error);
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBe(error);
    }));

    it('should convert non-Error objects to Error', fakeAsync(() => {
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
      fixture.componentInstance.sendEmail.run({ message: 'test' }).catch((error) => (rejection = error));
      requireCall(convex.actionCalls).reject('string error');
      tick();

      const error = fixture.componentInstance.sendEmail.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
      expect(rejection).toBe(error);
    }));

    it('should reject with the same error stored in state', fakeAsync(() => {
      const failure = new Error('Failed');

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
      fixture.componentInstance.sendEmail.run({ message: 'test' }).catch((error) => (rejection = error));
      requireCall(convex.actionCalls).reject(failure);
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

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve(mockResult);
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback with error', fakeAsync(() => {
      const error = new Error('Failed');
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

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(error);
      tick();

      expect(onError).toHaveBeenCalledWith(error);
      expect(fixture.componentInstance.sendEmail.error()).toBe(error);
    }));

    it('should not call onSuccess on error', fakeAsync(() => {
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

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(new Error('Failed'));
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError on success', fakeAsync(() => {
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

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(onError).not.toHaveBeenCalled();
    }));
  });

  describe('loading states', () => {
    it('should set isLoading to false after success', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should set isLoading to false after error', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(new Error('Failed'));
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
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should return error status after failed action', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(new Error('Failed'));
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
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(true);
    }));

    it('should be false after failed action', fakeAsync(() => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(new Error('Failed'));
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset all state to initial values', fakeAsync(() => {
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
      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).resolve({ success: true });
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
      ignoreRejection(fixture.componentInstance.sendEmail.run({ message: 'test' }));
      requireCall(convex.actionCalls).reject(new Error('Failed'));
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
      fixture.componentInstance.sendEmail.run({ message: 'first' }).then((value) => (firstResult = value));
      fixture.componentInstance.sendEmail.run({ message: 'second' }).then((value) => (secondResult = value));

      requireCall(convex.actionCalls, 1).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
      expect(secondResult).toEqual({ success: true });

      requireCall(convex.actionCalls, 0).resolve({ success: false });
      tick();

      expect(firstResult).toEqual({ success: false });
      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should ignore stale errors when a newer action succeeds', fakeAsync(() => {
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
      fixture.componentInstance.sendEmail.run({ message: 'first' }).catch((error) => (firstError = error));
      fixture.componentInstance.sendEmail.run({ message: 'second' }).then((value) => (secondResult = value));

      requireCall(convex.actionCalls, 1).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(secondResult).toEqual({ success: true });

      const staleError = new Error('stale failure');
      requireCall(convex.actionCalls, 0).reject(staleError);
      tick();

      expect(firstError).toBe(staleError);
      expect(fixture.componentInstance.sendEmail.data()).toEqual({
        success: true,
      });
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should let the latest failure win over an older success', fakeAsync(() => {
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
      fixture.componentInstance.sendEmail.run({ message: 'first' }).then((value) => (firstResult = value));
      fixture.componentInstance.sendEmail.run({ message: 'second' }).catch((error) => (secondError = error));

      const latestError = new Error('latest failure');
      requireCall(convex.actionCalls, 1).reject(latestError);
      tick();

      expect(secondError).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.error()).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      requireCall(convex.actionCalls, 0).resolve({ success: true });
      tick();

      expect(firstResult).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.error()).toBe(latestError);
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
    }));

    it('should keep loading tied to the latest action only', fakeAsync(() => {
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

      requireCall(convex.actionCalls, 1).resolve({ success: true });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      requireCall(convex.actionCalls, 0).resolve({ success: false });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore in-flight completions after reset', fakeAsync(() => {
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
      fixture.componentInstance.sendEmail.run({ message: 'test' }).then((value) => (result = value));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending success after the owning component is destroyed', fakeAsync(() => {
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

      let result: unknown;
      fixture.componentInstance.sendEmail.run({ message: 'test' }).then((value) => (result = value));

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the owning component is destroyed', fakeAsync(() => {
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

      let rejection: unknown;
      ignoreRejection(
        fixture.componentInstance.sendEmail.run({ message: 'test' }).catch((error) => (rejection = error)),
      );

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(true);

      fixture.destroy();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);

      const destroyedError = new Error('after destroy');
      requireCall(convex.actionCalls).reject(destroyedError);
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

      const sendEmail = injectAction(mockAction, { injectRef: injector });
      sendEmail.run({ message: 'test' });
      const call = requireCall(convex.actionCalls);
      call.resolve({ success: true });
      tick();

      expect(sendEmail.data()).toEqual({ success: true });
      expect(call.fn).toBe(mockAction);
      expect(call.args).toEqual({ message: 'test' });
      expect(call.options).toBeUndefined();
    }));

    it('should ignore a pending success after the provided injector is destroyed', fakeAsync(() => {
      const onSuccess = jest.fn();

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

      requireCall(convex.actionCalls).resolve({ success: true });
      tick();

      expect(result).toEqual({ success: true });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(sendEmail.data()).toBeUndefined();
      expect(sendEmail.error()).toBeUndefined();
      expect(sendEmail.status()).toBe('idle');
      expect(sendEmail.isLoading()).toBe(false);
    }));

    it('should ignore a pending failure after the provided injector is destroyed', fakeAsync(() => {
      const onError = jest.fn();

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
      requireCall(convex.actionCalls).reject(destroyedError);
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
