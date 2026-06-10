import { ApplicationRef, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  ConvexHydrationState,
  makeQueryStateKey,
  serializeQueryArgs,
  unwrapQueryResult,
  wrapQueryResult,
} from './state-transfer';

describe('state-transfer utilities', () => {
  describe('serializeQueryArgs', () => {
    it('should produce stable JSON for plain args', () => {
      expect(serializeQueryArgs({ count: 10, name: 'a' })).toBe('{"count":10,"name":"a"}');
    });

    it('should encode non-JSON convex values', () => {
      const key = serializeQueryArgs({ big: BigInt(42) });
      expect(key).toContain('$integer');
    });
  });

  describe('makeQueryStateKey', () => {
    it('should namespace keys by query name and args', () => {
      const key = makeQueryStateKey('todos:list', '{"count":10}');
      expect(String(key)).toBe('cva:todos:list:{"count":10}');
    });
  });

  describe('wrapQueryResult / unwrapQueryResult', () => {
    it('should round-trip plain values', () => {
      const wrapped = wrapQueryResult([{ _id: '1', title: 'todo' }]);
      expect(unwrapQueryResult(wrapped)).toEqual([{ _id: '1', title: 'todo' }]);
    });

    it('should round-trip bigint values', () => {
      const wrapped = wrapQueryResult({ big: BigInt(42) });
      expect(unwrapQueryResult(wrapped)).toEqual({ big: BigInt(42) });
    });

    it('should round-trip null', () => {
      expect(unwrapQueryResult(wrapQueryResult(null))).toBeNull();
    });

    it('should round-trip undefined results', () => {
      const wrapped = wrapQueryResult(undefined);
      expect(unwrapQueryResult(wrapped)).toBeUndefined();
    });

    it('should produce JSON-serializable wrappers', () => {
      const wrapped = wrapQueryResult({ big: BigInt(42), nested: [1, 'two'] });
      expect(() => JSON.stringify(wrapped)).not.toThrow();
      expect(unwrapQueryResult(JSON.parse(JSON.stringify(wrapped)))).toEqual({
        big: BigInt(42),
        nested: [1, 'two'],
      });
    });
  });
});

describe('ConvexHydrationState', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConvexHydrationState],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should consume a transferred result during the hydration window', () => {
    const transferState = TestBed.inject(TransferState);
    transferState.set(makeQueryStateKey('todos:list', '{"count":10}'), wrapQueryResult([{ _id: '1' }]));

    const hydration = TestBed.inject(ConvexHydrationState);
    expect(hydration.consume('todos:list', '{"count":10}')).toEqual({ value: [{ _id: '1' }] });
  });

  it('should consume transferred undefined results', () => {
    const transferState = TestBed.inject(TransferState);
    transferState.set(makeQueryStateKey('todos:get', '{}'), wrapQueryResult(undefined));

    const hydration = TestBed.inject(ConvexHydrationState);
    expect(hydration.consume('todos:get', '{}')).toEqual({ value: undefined });
  });

  it('should return undefined when no entry was transferred', () => {
    const hydration = TestBed.inject(ConvexHydrationState);
    expect(hydration.consume('todos:list', '{"count":10}')).toBeUndefined();
  });

  it('should not delete entries on consume so multiple consumers can seed', () => {
    const transferState = TestBed.inject(TransferState);
    transferState.set(makeQueryStateKey('todos:list', '{}'), wrapQueryResult('value'));

    const hydration = TestBed.inject(ConvexHydrationState);
    expect(hydration.consume('todos:list', '{}')).toEqual({ value: 'value' });
    expect(hydration.consume('todos:list', '{}')).toEqual({ value: 'value' });
  });

  it('should stop seeding after the application becomes stable', async () => {
    const transferState = TestBed.inject(TransferState);
    transferState.set(makeQueryStateKey('todos:list', '{}'), wrapQueryResult('value'));

    const hydration = TestBed.inject(ConvexHydrationState);
    expect(hydration.consume('todos:list', '{}')).toEqual({ value: 'value' });

    await TestBed.inject(ApplicationRef).whenStable();

    expect(hydration.consume('todos:list', '{}')).toBeUndefined();
  });
});
