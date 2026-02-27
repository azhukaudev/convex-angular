import { createCallableProvider } from './create-callable-provider';

describe('createCallableProvider', () => {
  describe('initial state', () => {
    it('should initialize with undefined data', () => {
      const provider = createCallableProvider();
      expect(provider.data()).toBeUndefined();
    });

    it('should initialize with no error', () => {
      const provider = createCallableProvider();
      expect(provider.error()).toBeUndefined();
    });

    it('should initialize with isLoading false', () => {
      const provider = createCallableProvider();
      expect(provider.isLoading()).toBe(false);
    });

    it('should initialize with isSuccess false', () => {
      const provider = createCallableProvider();
      expect(provider.isSuccess()).toBe(false);
    });

    it('should initialize with isError false', () => {
      const provider = createCallableProvider();
      expect(provider.isError()).toBe(false);
    });

    it('should initialize with idle status', () => {
      const provider = createCallableProvider();
      expect(provider.status()).toBe('idle');
    });
  });

  describe('execute — success path', () => {
    it('should set isLoading to true during execution', async () => {
      const provider = createCallableProvider<string>();
      let resolvePromise!: (value: string) => void;
      const promise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      const executePromise = provider.execute(() => promise);
      expect(provider.isLoading()).toBe(true);
      expect(provider.status()).toBe('pending');

      resolvePromise('done');
      await executePromise;
    });

    it('should set data on success', async () => {
      const provider = createCallableProvider<string>();
      await provider.execute(() => Promise.resolve('result'));

      expect(provider.data()).toBe('result');
      expect(provider.error()).toBeUndefined();
      expect(provider.isLoading()).toBe(false);
      expect(provider.isSuccess()).toBe(true);
      expect(provider.isError()).toBe(false);
      expect(provider.status()).toBe('success');
    });

    it('should return the result from execute', async () => {
      const provider = createCallableProvider<number>();
      const result = await provider.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('should call onSuccess callback', async () => {
      const onSuccess = jest.fn();
      const provider = createCallableProvider<string>({ onSuccess });

      await provider.execute(() => Promise.resolve('data'));

      expect(onSuccess).toHaveBeenCalledWith('data');
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should not call onError on success', async () => {
      const onError = jest.fn();
      const provider = createCallableProvider<string>({ onError });

      await provider.execute(() => Promise.resolve('data'));

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('execute — error path', () => {
    it('should set error signal on failure', async () => {
      const provider = createCallableProvider<string>();
      const error = new Error('fail');

      await provider.execute(() => Promise.reject(error)).catch(() => {});

      expect(provider.error()).toBe(error);
      expect(provider.data()).toBeUndefined();
      expect(provider.isLoading()).toBe(false);
      expect(provider.isSuccess()).toBe(false);
      expect(provider.isError()).toBe(true);
      expect(provider.status()).toBe('error');
    });

    it('should re-throw the error', async () => {
      const provider = createCallableProvider<string>();
      const error = new Error('fail');

      await expect(provider.execute(() => Promise.reject(error))).rejects.toBe(
        error,
      );
    });

    it('should convert non-Error objects to Error', async () => {
      const provider = createCallableProvider<string>();

      await provider
        .execute(() => Promise.reject('string error'))
        .catch(() => {});

      const err = provider.error();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('string error');
    });

    it('should call onError callback with wrapped Error', async () => {
      const onError = jest.fn();
      const provider = createCallableProvider<string>({ onError });

      await provider.execute(() => Promise.reject('oops')).catch(() => {});

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(onError.mock.calls[0][0].message).toBe('oops');
    });

    it('should not call onSuccess on error', async () => {
      const onSuccess = jest.fn();
      const provider = createCallableProvider<string>({ onSuccess });

      await provider
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});

      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('execute — clearing state between calls', () => {
    it('should clear previous data before a new call', async () => {
      const provider = createCallableProvider<string>();
      await provider.execute(() => Promise.resolve('first'));
      expect(provider.data()).toBe('first');

      let resolveSecond!: (value: string) => void;
      const secondPromise = new Promise<string>((resolve) => {
        resolveSecond = resolve;
      });

      const executePromise = provider.execute(() => secondPromise);
      // Data should be cleared while second call is in flight
      expect(provider.data()).toBeUndefined();
      expect(provider.isLoading()).toBe(true);

      resolveSecond('second');
      await executePromise;
      expect(provider.data()).toBe('second');
    });

    it('should clear previous error before a new call', async () => {
      const provider = createCallableProvider<string>();
      await provider
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});
      expect(provider.error()).toBeDefined();

      const executePromise = provider.execute(() => Promise.resolve('ok'));
      expect(provider.error()).toBeUndefined();
      await executePromise;
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values after success', async () => {
      const provider = createCallableProvider<string>();
      await provider.execute(() => Promise.resolve('data'));

      expect(provider.data()).toBe('data');
      expect(provider.status()).toBe('success');

      provider.reset();

      expect(provider.data()).toBeUndefined();
      expect(provider.error()).toBeUndefined();
      expect(provider.isLoading()).toBe(false);
      expect(provider.isSuccess()).toBe(false);
      expect(provider.isError()).toBe(false);
      expect(provider.status()).toBe('idle');
    });

    it('should reset all state to initial values after error', async () => {
      const provider = createCallableProvider<string>();
      await provider
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});

      expect(provider.error()).toBeDefined();
      expect(provider.status()).toBe('error');

      provider.reset();

      expect(provider.data()).toBeUndefined();
      expect(provider.error()).toBeUndefined();
      expect(provider.isLoading()).toBe(false);
      expect(provider.isSuccess()).toBe(false);
      expect(provider.isError()).toBe(false);
      expect(provider.status()).toBe('idle');
    });
  });

  describe('no options provided', () => {
    it('should work without options', async () => {
      const provider = createCallableProvider<number>();
      const result = await provider.execute(() => Promise.resolve(99));
      expect(result).toBe(99);
      expect(provider.data()).toBe(99);
    });

    it('should work without options on error', async () => {
      const provider = createCallableProvider<number>();
      await provider
        .execute(() => Promise.reject(new Error('no opts')))
        .catch(() => {});
      expect(provider.error()?.message).toBe('no opts');
    });
  });
  describe('onSettled callback', () => {
    it('should call onSettled after success', async () => {
      const onSettled = jest.fn();
      const provider = createCallableProvider<string>({ onSettled });

      await provider.execute(() => Promise.resolve('data'));

      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('should call onSettled after error', async () => {
      const onSettled = jest.fn();
      const provider = createCallableProvider<string>({ onSettled });

      await provider
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});

      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('should call onSettled after onSuccess', async () => {
      const callOrder: string[] = [];
      const onSuccess = jest.fn(() => callOrder.push('onSuccess'));
      const onSettled = jest.fn(() => callOrder.push('onSettled'));
      const provider = createCallableProvider<string>({
        onSuccess,
        onSettled,
      });

      await provider.execute(() => Promise.resolve('data'));

      expect(callOrder).toEqual(['onSuccess', 'onSettled']);
    });

    it('should call onSettled after onError', async () => {
      const callOrder: string[] = [];
      const onError = jest.fn(() => callOrder.push('onError'));
      const onSettled = jest.fn(() => callOrder.push('onSettled'));
      const provider = createCallableProvider<string>({ onError, onSettled });

      await provider
        .execute(() => Promise.reject(new Error('fail')))
        .catch(() => {});

      expect(callOrder).toEqual(['onError', 'onSettled']);
    });
  });
});
