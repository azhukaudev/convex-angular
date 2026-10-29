import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { injectUserCallbacks } from './user-callback';

describe('injectUserCallbacks', () => {
  let handleError: jest.Mock;

  function create<S extends unknown[], E extends unknown[]>(options?: {
    onSuccess?: (...args: S) => void;
    onError?: (...args: E) => void;
  }) {
    return TestBed.runInInjectionContext(() => injectUserCallbacks(options));
  }

  beforeEach(() => {
    handleError = jest.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ErrorHandler, useValue: { handleError } }] });
  });

  it('calls the consumer callbacks once with the same arguments, without reporting an error', () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();
    const failure = new Error('failed');
    const callbacks = create({ onSuccess, onError });

    callbacks.onSuccess('key', 1);
    callbacks.onError('key', failure);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('key', 1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('key', failure);
    expect(handleError).not.toHaveBeenCalled();
  });

  it.each(['onSuccess', 'onError'] as const)(
    'does not throw when %s throws and reports the thrown value to the ErrorHandler',
    (name) => {
      const thrown = new Error('callback failed');
      const callbacks = create({
        [name]: () => {
          throw thrown;
        },
      });

      expect(() => callbacks[name]()).not.toThrow();

      expect(handleError).toHaveBeenCalledTimes(1);
      expect(handleError).toHaveBeenCalledWith(thrown);
    },
  );

  it.each(['onSuccess', 'onError'] as const)('calls the %s a consumer assigns after creation', (name) => {
    const original = jest.fn();
    const replacement = jest.fn();
    const options: { onSuccess?: (value: number) => void; onError?: (value: number) => void } = { [name]: original };
    const callbacks = create(options);

    options[name] = replacement;
    callbacks[name](1);

    expect(original).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledWith(1);
  });

  it('returns no-op callbacks when the options or the callbacks are absent', () => {
    for (const callbacks of [create(), create({})]) {
      expect(() => callbacks.onSuccess()).not.toThrow();
      expect(() => callbacks.onError()).not.toThrow();
    }

    expect(handleError).not.toHaveBeenCalled();
  });
});
