import { Component } from '@angular/core';
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
        standalone: true,
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

      fixture.componentInstance.sendEmail.run({ message: 'test' });
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
      fixture.componentInstance.sendEmail.run({ message: 'test' });
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

      fixture.componentInstance.sendEmail.run({ message: 'test' });
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

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      const error = fixture.componentInstance.sendEmail.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
    }));

    it('should return undefined on error', fakeAsync(() => {
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

      let result: unknown = 'not-undefined';
      fixture.componentInstance.sendEmail
        .run({ message: 'test' })
        .then((r) => (result = r));
      tick();

      expect(result).toBeUndefined();
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
        standalone: true,
      })
      class TestComponent {
        readonly sendEmail = injectAction(mockAction, { onError });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.sendEmail.run({ message: 'test' });
      tick();

      expect(onError).toHaveBeenCalledWith(error);
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

      fixture.componentInstance.sendEmail.run({ message: 'test' });
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
        standalone: true,
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
        standalone: true,
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
  });
});
