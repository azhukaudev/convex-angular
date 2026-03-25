import { FunctionReference } from 'convex/server';

import { preloadQuery, preloadedQueryResult } from './preload';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:getOne'),
}));

jest.mock('./http', () => ({
  fetchQuery: jest.fn(),
}));

const { fetchQuery } = jest.requireMock('./http') as {
  fetchQuery: jest.Mock;
};

const mockQueryRef = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { id: string },
  { id: string; tags: string[] }
>;

describe('ssr/preload', () => {
  beforeEach(() => {
    fetchQuery.mockReset();
  });

  it('preloadQuery serializes the query name, args, and result', async () => {
    fetchQuery.mockResolvedValue({ id: '1', tags: ['angular'] });

    const preloaded = await preloadQuery(mockQueryRef, { id: '1' });

    expect(preloaded._name).toBe('todos:getOne');
    expect(preloaded._argsJSON).toBe('{"id":"1"}');
    expect(preloaded._valueJSON).toBe('{"id":"1","tags":["angular"]}');
  });

  it('preloadQuery defaults omitted args to an empty object', async () => {
    const noArgsQueryRef = (() => {}) as unknown as FunctionReference<
      'query',
      'public',
      Record<string, never>,
      { ok: true }
    >;
    fetchQuery.mockResolvedValue({ ok: true });

    const preloaded = await preloadQuery(noArgsQueryRef);

    expect(preloaded._argsJSON).toBe('{}');
  });

  it('preloadedQueryResult deserializes the preloaded value', () => {
    const result = preloadedQueryResult({
      __type: mockQueryRef,
      _name: 'todos:getOne',
      _argsJSON: '{"id":"1"}',
      _valueJSON: '{"id":"1","tags":["angular"]}',
    });

    expect(result).toEqual({ id: '1', tags: ['angular'] });
  });
});
