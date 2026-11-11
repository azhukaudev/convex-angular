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

describe('MockConvexClient warm-cache keys', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();
  });

  function seedEach(seeds: ReadonlyArray<readonly [Record<string, unknown>, string]>): void {
    for (const [args, marker] of seeds) {
      convex.seedQueryResult('todos:list', args, marker);
    }
  }

  it('finds a seed regardless of property order, at every depth', () => {
    convex.seedQueryResult('todos:list', { c: 3, b: { z: 1, y: 2 }, a: [{ q: 1, p: 2 }] }, 'seeded');

    expect(convex.client.localQueryResult('todos:list', { a: [{ p: 2, q: 1 }], b: { y: 2, z: 1 }, c: 3 })).toBe(
      'seeded',
    );
  });

  it('treats a field set to undefined as absent, like the real client', () => {
    convex.seedQueryResult('todos:list', { status: undefined }, 'no-filter');

    expect(convex.client.localQueryResult('todos:list', {})).toBe('no-filter');
    expect(convex.client.localQueryResult('todos:list', { status: undefined, page: undefined })).toBe('no-filter');
  });

  it('finds a {} seed for a lookup without args and records the lookup as made', () => {
    convex.seedQueryResult('todos:list', {}, 'seeded');

    expect(convex.client.localQueryResult('todos:list')).toBe('seeded');
    expect(convex.localQueryResultCalls).toEqual([{ queryName: 'todos:list', args: undefined }]);
  });

  it('keys bigint, byte and special-float args, and keeps them apart from look-alikes', () => {
    const seeds = [
      [{ n: BigInt(1) }, 'bigint'],
      [{ n: 1 }, 'number'],
      [{ bytes: new ArrayBuffer(1) }, 'one-byte'],
      [{ bytes: new ArrayBuffer(2) }, 'two-bytes'],
      [{ value: Number.NaN }, 'nan'],
      [{ value: null }, 'null'],
      [{ value: -0 }, 'negative-zero'],
      [{ value: 0 }, 'zero'],
    ] as const;
    seedEach(seeds);

    for (const [args, marker] of seeds) {
      expect(convex.client.localQueryResult('todos:list', args)).toBe(marker);
    }
  });

  it('rejects seeds whose args are not Convex values, as the real lookup does', () => {
    expect(() => convex.seedQueryResult('todos:list', { since: new Date(0) }, 'x')).toThrow(Error);
    expect(() => convex.seedQueryError('todos:list', { ids: new Set(['a']) }, new Error('boom'))).toThrow(Error);
    expect(() => convex.client.localQueryResult('todos:list', { since: new Date(0) })).toThrow(Error);
  });
});
