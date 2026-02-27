import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { CONVEX } from '../tokens/convex';
import { MutationReference, injectMutation } from './inject-mutation';

// Mock mutation function reference
const mockMutation = (() => {}) as unknown as FunctionReference<
  'mutation',
  'public',
  { title: string },
  { id: string }
> as MutationReference;

describe('injectMutation', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;

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

  describe('running mutations', () => {
    it('should set isLoading to true when mutate() is called', fakeAsync(() => {
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });

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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(fixture.componentInstance.addTodo.data()).toEqual(mockResult);
    }));

    it('should return result from mutate()', fakeAsync(() => {
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
      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .then((r) => (result = r));
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

      // First call - error
      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.error()).toBeDefined();

      // Second call - should clear error
      fixture.componentInstance.addTodo.mutate({ title: 'test2' });

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

      fixture.componentInstance.addTodo.mutate({ title: 'Buy groceries' });
      tick();

      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutation,
        { title: 'Buy groceries' },
        { optimisticUpdate: undefined },
      );
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      const error = fixture.componentInstance.addTodo.error();
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('string error');
    }));

    it('should re-throw error from mutate()', fakeAsync(() => {
      const error = new Error('Failed');
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

      let caughtError: unknown;
      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch((e) => (caughtError = e));
      tick();

      expect(caughtError).toBe(error);
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(onSuccess).toHaveBeenCalledWith(mockResult);
    }));

    it('should call onError callback with error', fakeAsync(() => {
      const error = new Error('Failed');
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(onError).toHaveBeenCalledWith(error);
    }));

    it('should not call onSuccess on error', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(onSuccess).not.toHaveBeenCalled();
    }));

    it('should not call onError on success', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(onError).not.toHaveBeenCalled();
    }));
  });

  describe('optimistic updates', () => {
    it('should pass optimisticUpdate option to convex.mutation()', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });
      const optimisticUpdate = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { optimisticUpdate });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(mockConvexClient.mutation).toHaveBeenCalledWith(
        mockMutation,
        { title: 'test' },
        { optimisticUpdate },
      );
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });

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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.status()).toBe('error');
    }));
  });

  describe('isSuccess signal', () => {
    it('should be false initially', () => {
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
    });

    it('should be false while mutation is running', fakeAsync(() => {
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));

    it('should be true after successful mutation', fakeAsync(() => {
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(true);
    }));

    it('should be false after failed mutation', fakeAsync(() => {
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));
  });

  describe('isError signal', () => {
    it('should be false initially', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation);
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.addTodo.isError()).toBe(false);
    });

    it('should be true after failed mutation', fakeAsync(() => {
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.isError()).toBe(true);
    }));

    it('should be false after successful mutation', fakeAsync(() => {
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

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(fixture.componentInstance.addTodo.isError()).toBe(false);
    }));

    it('should be false after reset', fakeAsync(() => {
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

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.isError()).toBe(true);

      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.isError()).toBe(false);
    }));
  });

  describe('reset', () => {
    it('should reset all state to initial values', fakeAsync(() => {
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

      // Run a mutation
      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(fixture.componentInstance.addTodo.data()).toBeDefined();
      expect(fixture.componentInstance.addTodo.status()).toBe('success');

      // Reset
      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.data()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.error()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.isLoading()).toBe(false);
      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
      expect(fixture.componentInstance.addTodo.isSuccess()).toBe(false);
    }));

    it('should reset error state', fakeAsync(() => {
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

      // Run a failing mutation
      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(fixture.componentInstance.addTodo.error()).toBeDefined();
      expect(fixture.componentInstance.addTodo.status()).toBe('error');

      // Reset
      fixture.componentInstance.addTodo.reset();

      expect(fixture.componentInstance.addTodo.error()).toBeUndefined();
      expect(fixture.componentInstance.addTodo.status()).toBe('idle');
    }));
  });
  describe('onSettled callback', () => {
    it('should call onSettled after successful mutation', fakeAsync(() => {
      mockConvexClient.mutation.mockResolvedValue({ id: '123' });
      const onSettled = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onSettled });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo.mutate({ title: 'test' });
      tick();

      expect(onSettled).toHaveBeenCalledTimes(1);
    }));

    it('should call onSettled after failed mutation', fakeAsync(() => {
      mockConvexClient.mutation.mockRejectedValue(new Error('Failed'));
      const onSettled = jest.fn();

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly addTodo = injectMutation(mockMutation, { onSettled });
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      fixture.componentInstance.addTodo
        .mutate({ title: 'test' })
        .catch(() => {});
      tick();

      expect(onSettled).toHaveBeenCalledTimes(1);
    }));
  });
});
