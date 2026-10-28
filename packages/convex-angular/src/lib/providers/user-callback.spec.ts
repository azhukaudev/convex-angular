import { ErrorHandler } from '@angular/core';

import { runUserCallback } from './user-callback';

describe('runUserCallback', () => {
  let errorHandler: ErrorHandler;
  let handleError: jest.Mock;

  beforeEach(() => {
    handleError = jest.fn();
    errorHandler = { handleError } as unknown as ErrorHandler;
  });

  it('runs the callback once without reporting an error', () => {
    const callback = jest.fn();

    runUserCallback(errorHandler, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(handleError).not.toHaveBeenCalled();
  });

  it('does not throw when the callback throws and reports the thrown value to the ErrorHandler', () => {
    const thrown = new Error('callback failed');

    expect(() =>
      runUserCallback(errorHandler, () => {
        throw thrown;
      }),
    ).not.toThrow();

    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(thrown);
  });
});
