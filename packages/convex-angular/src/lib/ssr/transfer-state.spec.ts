import { TransferState, makeStateKey } from '@angular/core';
import { FunctionReference } from 'convex/server';

import { readTransferredPreloadedQuery, transferPreloadedQuery } from './transfer-state';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn((query: { _name?: string }) => query._name ?? 'todos:getOne'),
}));

const mockQueryRef = { _name: 'todos:getOne' } as unknown as FunctionReference<
  'query',
  'public',
  { id: string },
  { id: string }
>;

describe('ssr/transfer-state', () => {
  it('writes and reads preloaded queries through TransferState', () => {
    const transferState = new TransferState();
    const preloaded = {
      __type: mockQueryRef,
      _name: 'todos:getOne',
      _argsJSON: '{"id":"1"}',
      _valueJSON: '{"id":"1"}',
    };

    transferPreloadedQuery(preloaded, transferState);

    expect(readTransferredPreloadedQuery(mockQueryRef, transferState, { id: '1' })).toEqual({
      _name: 'todos:getOne',
      _argsJSON: '{"id":"1"}',
      _valueJSON: '{"id":"1"}',
    });
  });

  it('removes consumed entries after reading them', () => {
    const transferState = new TransferState();
    const preloaded = {
      __type: mockQueryRef,
      _name: 'todos:getOne',
      _argsJSON: '{"id":"1"}',
      _valueJSON: '{"id":"1"}',
    };

    transferPreloadedQuery(preloaded, transferState);

    expect(readTransferredPreloadedQuery(mockQueryRef, transferState, { id: '1' })).toEqual({
      _name: 'todos:getOne',
      _argsJSON: '{"id":"1"}',
      _valueJSON: '{"id":"1"}',
    });
    expect(readTransferredPreloadedQuery(mockQueryRef, transferState, { id: '1' })).toBeNull();
  });

  it('throws a focused error for malformed payload JSON', () => {
    const transferState = new TransferState();
    transferState.set(makeStateKey<string>('convex-angular:ssr:todos:getOne:{"id":"1"}'), '{not valid json');

    expect(() => readTransferredPreloadedQuery(mockQueryRef, transferState, { id: '1' })).toThrow(/malformed JSON/i);
  });

  it('throws a focused error for missing payload fields', () => {
    const transferState = new TransferState();
    transferState.set(
      makeStateKey<string>('convex-angular:ssr:todos:getOne:{"id":"1"}'),
      JSON.stringify({ _argsJSON: '{"id":"1"}', _valueJSON: '{"id":"1"}' }),
    );

    expect(() => readTransferredPreloadedQuery(mockQueryRef, transferState, { id: '1' })).toThrow(/missing _name/i);
  });

  it('matches semantically identical args with different key order', () => {
    const transferState = new TransferState();
    const preloaded = {
      __type: mockQueryRef,
      _name: 'todos:getOne',
      _argsJSON: '{"a":"1","b":"2"}',
      _valueJSON: '{"id":"1"}',
    };

    transferPreloadedQuery(preloaded, transferState);

    expect(
      readTransferredPreloadedQuery(
        mockQueryRef as unknown as FunctionReference<'query', 'public', { b: string; a: string }, { id: string }>,
        transferState,
        { b: '2', a: '1' },
      ),
    ).toEqual({
      _name: 'todos:getOne',
      _argsJSON: '{"a":"1","b":"2"}',
      _valueJSON: '{"id":"1"}',
    });
  });
});
