import { ConvexClient } from 'convex/browser';

import { ConvexHydrationState } from '../ssr/state-transfer';
import { readInitialQueryData } from './initial-query-data';

describe('readInitialQueryData', () => {
  let mockLocalQueryResult: jest.Mock;
  let mockConsume: jest.Mock;
  let disabled: boolean;

  const queryName = 'todos:listTodos';
  const args = { count: 10 };
  const argsKey = '{"count":10}';

  function convexClient(): ConvexClient {
    return {
      get disabled() {
        return disabled;
      },
      client: {
        localQueryResult: mockLocalQueryResult,
      },
    } as unknown as ConvexClient;
  }

  function hydrationState(): ConvexHydrationState {
    return { consume: mockConsume } as unknown as ConvexHydrationState;
  }

  beforeEach(() => {
    disabled = false;
    mockLocalQueryResult = jest.fn().mockReturnValue(undefined);
    mockConsume = jest.fn().mockReturnValue(undefined);
  });

  it('returns a cache hit from the warm client cache', () => {
    const cached = [{ _id: '1', title: 'Cached todo' }];
    mockLocalQueryResult.mockReturnValue(cached);

    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toEqual({ kind: 'cache', value: cached });
    expect(mockLocalQueryResult).toHaveBeenCalledWith(queryName, args);
  });

  it('prefers the warm cache over transferred data', () => {
    const cached = [{ _id: '1', title: 'Cached todo' }];
    mockLocalQueryResult.mockReturnValue(cached);
    mockConsume.mockReturnValue({ value: [{ _id: '2', title: 'Transferred todo' }] });

    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toEqual({ kind: 'cache', value: cached });
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('falls back to transferred data on a cache miss', () => {
    const transferred = [{ _id: '2', title: 'Transferred todo' }];
    mockConsume.mockReturnValue({ value: transferred });

    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toEqual({ kind: 'transferred', value: transferred });
    expect(mockConsume).toHaveBeenCalledWith(queryName, argsKey);
  });

  it('preserves a transferred result whose value is undefined', () => {
    mockConsume.mockReturnValue({ value: undefined });

    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toEqual({ kind: 'transferred', value: undefined });
  });

  it('skips the client cache on a disabled client', () => {
    disabled = true;
    mockLocalQueryResult.mockReturnValue([{ _id: '1', title: 'Cached todo' }]);

    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toBeUndefined();
    expect(mockLocalQueryResult).not.toHaveBeenCalled();
  });

  it('returns undefined when neither cache nor transfer has data', () => {
    const initial = readInitialQueryData(convexClient(), hydrationState(), queryName, args, argsKey);

    expect(initial).toBeUndefined();
  });

  it('returns undefined without a hydration state (setups providing only the CONVEX token)', () => {
    const initial = readInitialQueryData(convexClient(), null, queryName, args, argsKey);

    expect(initial).toBeUndefined();
  });
});
