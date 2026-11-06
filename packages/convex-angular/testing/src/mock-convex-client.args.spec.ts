import { type QueryReference } from 'convex-angular';
import { FunctionReference } from 'convex/server';

import { MockConvexClient } from './mock-convex-client';

jest.mock('convex/server', () => ({
  ...jest.requireActual<typeof import('convex/server')>('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:list'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  Array<{ _id: string; title: string }>
> as QueryReference;

describe('MockConvexClient argument validation', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
  });

  class Owner {
    readonly id = 'u1';
  }

  // Everything the real client's `convexToJson` rejects.
  const unsupportedArgs: Array<[string, Record<string, unknown>]> = [
    ['a Set', { ids: new Set(['a']) }],
    ['a Map', { ids: new Map([['a', 1]]) }],
    ['a Date', { since: new Date(0) }],
    ['a class instance', { owner: new Owner() }],
    ['an undefined inside an array', { ids: ['a', undefined] }],
    ['a $-prefixed field name', { $reserved: 1 }],
    ['an unsupported value nested in an object', { filter: { ids: new Set<string>() } }],
  ];

  it.each(unsupportedArgs)('onUpdate throws for %s and records no subscription', (_label, args) => {
    expect(() => convex.onUpdate(mockQuery, args, () => undefined)).toThrow(Error);
    expect(convex.querySubscriptions).toHaveLength(0);
  });

  it.each(unsupportedArgs)(
    'onPaginatedUpdate_experimental throws for %s and records no subscription',
    (_label, args) => {
      expect(() =>
        convex.onPaginatedUpdate_experimental(mockQuery, args, { initialNumItems: 10 }, () => undefined),
      ).toThrow(Error);
      expect(convex.paginatedSubscriptions).toHaveLength(0);
    },
  );

  it('accepts every Convex value, and an object field set to undefined', () => {
    const args = {
      n: 1,
      nan: Number.NaN,
      s: 'a',
      b: true,
      nil: null,
      big: BigInt(10),
      bytes: new ArrayBuffer(2),
      list: [1, 'a', { nested: [null] }],
      skipped: undefined,
    };

    expect(() => convex.onUpdate(mockQuery, args, () => undefined)).not.toThrow();
    expect(() =>
      convex.onPaginatedUpdate_experimental(mockQuery, args, { initialNumItems: 10 }, () => undefined),
    ).not.toThrow();
    expect(convex.querySubscriptions).toHaveLength(1);
    expect(convex.paginatedSubscriptions).toHaveLength(1);
  });

  it('rejects a one-shot query() that would open a subscription for unsupported args', async () => {
    await expect(convex.query(mockQuery, { ids: new Set<string>() })).rejects.toThrow(Error);
    expect(convex.querySubscriptions).toHaveLength(0);
  });

  it('does not validate args on a disabled client, like the real one, which returns before reading them', () => {
    const disabled = new MockConvexClient({ disabled: true });
    const args = { ids: new Set<string>() };

    expect(() => disabled.onUpdate(mockQuery, args, () => undefined)).not.toThrow();
    expect(() =>
      disabled.onPaginatedUpdate_experimental(mockQuery, args, { initialNumItems: 10 }, () => undefined),
    ).not.toThrow();
    expect(disabled.refusedSubscriptions).toHaveLength(2);
  });
});
