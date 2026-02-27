import { Component, Injector } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { ActionReference, injectAction } from './inject-action';

// Mock action function reference
const mockAction = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  { message: string },
  { success: boolean }
> as ActionReference;

describe('injectAction', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;

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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.data()).toBeUndefined();
    });

    it('should initialize with no error', () => {
      @Component({
        template: '',
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(fixture.componentInstance.sendEmail.data()).toEqual(mockResult);
    }));

    it('should return result from run()', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);

      @Component({
        template: '',
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // First call - error
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBe(error);
    }));

    it('should convert non-Error objects to Error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue('string error');

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      const error = fixture.componentInstance.sendEmail.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
    }));

    it('should re-throw error from run()', fakeAsync(() => {
      const error = new Error('Failed');
      mockConvexClient.action.mockRejectedValue(error);

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      let caughtError: unknown;
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch((e) => (caughtError = e));
      tick();

      expect(caughtError).toBe(error);
    }));
  });

  describe('callbacks', () => {
    it('should call onSuccess callback with result', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);
      const onSuccess = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback with error', fakeAsync(() => {
      const error = new Error('Failed');
      mockConvexClient.action.mockRejectedValue(error);
      const onError = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should not call onSuccess on error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));
      const onSuccess = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSuccess });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError on success', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });
      const onError = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(onError).not.toHaveBeenCalled();
    }));
  });

  describe('loading states', () => {
    it('should set isLoading to false after success', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));

    it('should set isLoading to false after error', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.isLoading()).toBe(false);
    }));
  });

  describe('status signal', () => {
    it('should return idle status initially', () => {
      @Component({
        template: '',
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('success');
    }));

    it('should return error status after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.status()).toBe('error');
    }));
  });

  describe('isSuccess signal', () => {
    it('should be false initially', () => {
      @Component({
        template: '',
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(true);
    }));

    it('should be false after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.isSuccess()).toBe(false);
    }));
  });

  describe('isError signal', () => {
    it('should be false initially', () => {
      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.sendEmail.isError()).toBe(false);
    });

    it('should be true after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.isError()).toBe(true);
    }));

    it('should be false after successful action', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(fixture.componentInstance.sendEmail.isError()).toBe(false);
    }));

    it('should be false after reset', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.isError()).toBe(true);

      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.isError()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset all state to initial values', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Run an action
      fixture.componentInstance.sendEmail.run({ message: 'test' });
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
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      // Run a failing action
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.sendEmail.error()).toBeDefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('error');

      // Reset
      fixture.componentInstance.sendEmail.reset();

      expect(fixture.componentInstance.sendEmail.error()).toBeUndefined();
      expect(fixture.componentInstance.sendEmail.status()).toBe('idle');
    }));
  });
  describe('onSettled callback', () => {
    it('should call onSettled after successful action', fakeAsync(() => {
      mockConvexClient.action.mockResolvedValue({ success: true });
      const onSettled = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSettled });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(onSettled).toHaveBeenCalledTimes(1);
    }));

    it('should call onSettled after failed action', fakeAsync(() => {
      mockConvexClient.action.mockRejectedValue(new Error('Failed'));
      const onSettled = jest.fn();

      @Component({
        template: '',
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onSettled });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .catch(() => {});
      tick();

      expect(onSettled).toHaveBeenCalledTimes(1);
    }));
  });

  describe('injector option', () => {
    it('should work when called outside injection context with injector', fakeAsync(() => {
      const mockResult = { success: true };
      mockConvexClient.action.mockResolvedValue(mockResult);
      const injector = TestBed.inject(Injector);

      const result = injectAction(mockAction, { injector });

      result.run({ message: 'test' });
      tick();

      expect(result.data()).toEqual(mockResult);
      expect(result.isSuccess()).toBe(true);
    }));
  });
});
