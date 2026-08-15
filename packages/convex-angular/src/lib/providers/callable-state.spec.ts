import { DestroyRef } from '@angular/core';

import { CallableState, createCallableState } from './callable-state';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createCallableState', () => {
  let destroyCallbacks: Array<() => void>;
  let destroyRef: DestroyRef;
  let invoke: jest.Mock;
  let onSuccess: jest.Mock;
  let onError: jest.Mock;

  function create(): CallableState<{ title: string }, string> {
    return createCallableState<{ title: string }, string>(destroyRef, invoke, { onSuccess, onError });
  }

  function destroyScope() {
    for (const callback of destroyCallbacks) {
      callback();
    }
  }

  beforeEach(() => {
    destroyCallbacks = [];
    destroyRef = {
      onDestroy: (callback: () => void) => {
        destroyCallbacks.push(callback);
        return () => undefined;
      },
    } as DestroyRef;
    invoke = jest.fn();
    onSuccess = jest.fn();
    onError = jest.fn();
  });

  describe('initial state', () => {
    it('starts idle with no data, error, or loading', () => {
      const state = create();

      expect(state.status()).toBe('idle');
      expect(state.data()).toBeUndefined();
      expect(state.error()).toBeUndefined();
      expect(state.isLoading()).toBe(false);
      expect(state.isSuccess()).toBe(false);
    });
  });

  describe('successful execution', () => {
    it('is pending while the invocation is in flight', async () => {
      const call = deferred<string>();
      invoke.mockReturnValue(call.promise);
      const state = create();

      const result = state.execute({ title: 'Todo' });

      expect(state.status()).toBe('pending');
      expect(state.isLoading()).toBe(true);

      call.resolve('id-1');
      await expect(result).resolves.toBe('id-1');
    });

    it('settles with data, success status, and the onSuccess callback', async () => {
      invoke.mockResolvedValue('id-1');
      const state = create();

      await state.execute({ title: 'Todo' });

      expect(state.status()).toBe('success');
      expect(state.data()).toBe('id-1');
      expect(state.error()).toBeUndefined();
      expect(state.isLoading()).toBe(false);
      expect(state.isSuccess()).toBe(true);
      expect(onSuccess).toHaveBeenCalledWith('id-1');
    });
  });

  describe('failed execution', () => {
    it('settles with the error, error status, and the onError callback before rejecting', async () => {
      const failure = new Error('mutation failed');
      invoke.mockRejectedValue(failure);
      const state = create();

      await expect(state.execute({ title: 'Todo' })).rejects.toBe(failure);

      expect(state.status()).toBe('error');
      expect(state.error()).toBe(failure);
      expect(state.data()).toBeUndefined();
      expect(state.isSuccess()).toBe(false);
      expect(onError).toHaveBeenCalledWith(failure);
    });

    it('wraps non-Error rejection values in an Error', async () => {
      invoke.mockRejectedValue('plain string failure');
      const state = create();

      await expect(state.execute({ title: 'Todo' })).rejects.toBeInstanceOf(Error);

      expect(state.error()?.message).toBe('plain string failure');
    });
  });

  describe('version guard', () => {
    it('only lets the latest invocation update state', async () => {
      const first = deferred<string>();
      const second = deferred<string>();
      invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const state = create();

      const firstResult = state.execute({ title: 'First' });
      const secondResult = state.execute({ title: 'Second' });

      second.resolve('id-2');
      await secondResult;
      expect(state.data()).toBe('id-2');
      expect(state.status()).toBe('success');

      // The stale first invocation settles its promise but must not
      // overwrite state or re-fire callbacks.
      first.resolve('id-1');
      await firstResult;

      expect(state.data()).toBe('id-2');
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith('id-2');
    });

    it('ignores stale failures after a newer invocation succeeded', async () => {
      const first = deferred<string>();
      const second = deferred<string>();
      invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const state = create();

      const firstResult = state.execute({ title: 'First' });
      const secondResult = state.execute({ title: 'Second' });

      second.resolve('id-2');
      await secondResult;

      first.reject(new Error('stale failure'));
      await expect(firstResult).rejects.toThrow('stale failure');

      expect(state.status()).toBe('success');
      expect(state.error()).toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('returns to idle and clears data and error', async () => {
      invoke.mockResolvedValue('id-1');
      const state = create();
      await state.execute({ title: 'Todo' });

      state.reset();

      expect(state.status()).toBe('idle');
      expect(state.data()).toBeUndefined();
      expect(state.error()).toBeUndefined();
      expect(state.isSuccess()).toBe(false);
    });

    it('prevents an in-flight invocation from updating state after reset', async () => {
      const call = deferred<string>();
      invoke.mockReturnValue(call.promise);
      const state = create();

      const result = state.execute({ title: 'Todo' });
      state.reset();

      call.resolve('id-1');
      await result;

      expect(state.status()).toBe('idle');
      expect(state.data()).toBeUndefined();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('still settles the promise but stops updating state and firing callbacks', async () => {
      const call = deferred<string>();
      invoke.mockReturnValue(call.promise);
      const state = create();

      const result = state.execute({ title: 'Todo' });
      destroyScope();

      call.resolve('id-1');
      await expect(result).resolves.toBe('id-1');

      expect(state.status()).toBe('idle');
      expect(state.data()).toBeUndefined();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('invokes without touching reactive state when executed after destroy', async () => {
      invoke.mockResolvedValue('id-1');
      const state = create();

      destroyScope();

      await expect(state.execute({ title: 'Todo' })).resolves.toBe('id-1');

      expect(invoke).toHaveBeenCalledWith({ title: 'Todo' });
      expect(state.status()).toBe('idle');
      expect(state.isLoading()).toBe(false);
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
