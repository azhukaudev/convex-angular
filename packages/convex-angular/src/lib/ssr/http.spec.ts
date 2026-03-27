import { ConvexHttpClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { fetchAction, fetchMutation, fetchQuery } from './http';

jest.mock('convex/browser', () => {
  const mockQuery = jest.fn();
  const mockMutation = jest.fn();
  const mockAction = jest.fn();

  return {
    ConvexHttpClient: jest.fn().mockImplementation(() => ({
      query: mockQuery,
      mutation: mockMutation,
      action: mockAction,
    })),
  };
});

const MockedConvexHttpClient = jest.mocked(ConvexHttpClient);
const legacyNextStyleConvexUrlEnv = ['NEXT', 'PUBLIC', 'CONVEX', 'URL'].join('_');

const mockQueryRef = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { id: string },
  { id: string; name: string }
>;

const mockMutationRef = (() => {}) as unknown as FunctionReference<
  'mutation',
  'public',
  { id: string },
  { updated: true }
>;

const mockActionRef = (() => {}) as unknown as FunctionReference<
  'action',
  'public',
  Record<string, never>,
  { ok: true }
>;

describe('ssr/http', () => {
  const originalAngularUrl = process.env.NG_APP_CONVEX_URL;
  const originalNextUrl = process.env[legacyNextStyleConvexUrlEnv];

  beforeEach(() => {
    process.env.NG_APP_CONVEX_URL = 'https://happy-animal-123.convex.cloud';
    delete process.env[legacyNextStyleConvexUrlEnv];
    MockedConvexHttpClient.mockClear();
  });

  afterEach(() => {
    if (originalAngularUrl === undefined) {
      delete process.env.NG_APP_CONVEX_URL;
    } else {
      process.env.NG_APP_CONVEX_URL = originalAngularUrl;
    }

    if (originalNextUrl === undefined) {
      delete process.env[legacyNextStyleConvexUrlEnv];
    } else {
      process.env[legacyNextStyleConvexUrlEnv] = originalNextUrl;
    }
  });

  it('prefers an explicit url over NG_APP_CONVEX_URL', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ id: '1', name: 'Ada' }),
      mutation: jest.fn(),
      action: jest.fn(),
    };
    MockedConvexHttpClient.mockImplementationOnce(() => client as any);

    await fetchQuery(mockQueryRef, { id: '1' }, { url: 'https://explicit.convex.cloud' });

    expect(MockedConvexHttpClient).toHaveBeenCalledWith(
      'https://explicit.convex.cloud',
      expect.any(Object),
    );
  });

  it('prefers NG_APP_CONVEX_URL when url is omitted', async () => {
    process.env.NG_APP_CONVEX_URL = 'https://angular-app.convex.cloud';

    const client = {
      query: jest.fn().mockResolvedValue({ id: '1', name: 'Ada' }),
      mutation: jest.fn(),
      action: jest.fn(),
    };
    MockedConvexHttpClient.mockImplementationOnce(() => client as any);

    await fetchQuery(mockQueryRef, { id: '1' });

    expect(MockedConvexHttpClient).toHaveBeenCalledWith(
      'https://angular-app.convex.cloud',
      expect.any(Object),
    );
  });

  it('fetchQuery forwards args and token through ConvexHttpClient', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ id: '1', name: 'Ada' }),
      mutation: jest.fn(),
      action: jest.fn(),
    };
    MockedConvexHttpClient.mockImplementationOnce(() => client as any);

    const result = await fetchQuery(mockQueryRef, { id: '1' }, { token: 'jwt-token' });

    expect(result).toEqual({ id: '1', name: 'Ada' });
    expect(MockedConvexHttpClient).toHaveBeenCalledWith(
      'https://happy-animal-123.convex.cloud',
      expect.objectContaining({
        auth: 'jwt-token',
        skipConvexDeploymentUrlCheck: undefined,
      }),
    );
    expect(client.query).toHaveBeenCalledWith(mockQueryRef, { id: '1' });
  });

  it('fetchMutation forwards args without admin-token support', async () => {
    const client = {
      query: jest.fn(),
      mutation: jest.fn().mockResolvedValue({ updated: true }),
      action: jest.fn(),
    };
    MockedConvexHttpClient.mockImplementationOnce(() => client as any);

    const result = await fetchMutation(mockMutationRef, { id: '1' });

    expect(result).toEqual({ updated: true });
    expect(client.mutation).toHaveBeenCalledWith(mockMutationRef, { id: '1' });
  });

  it('fetchAction defaults args to an empty object when omitted', async () => {
    const client = {
      query: jest.fn(),
      mutation: jest.fn(),
      action: jest.fn().mockResolvedValue({ ok: true }),
    };
    MockedConvexHttpClient.mockImplementationOnce(() => client as any);

    const result = await fetchAction(mockActionRef);

    expect(result).toEqual({ ok: true });
    expect(client.action).toHaveBeenCalledWith(mockActionRef, {});
  });

  it('ignores a Next-style convex url env var when NG_APP_CONVEX_URL is unset', async () => {
    delete process.env.NG_APP_CONVEX_URL;
    process.env[legacyNextStyleConvexUrlEnv] = 'https://next-only.convex.cloud';

    await expect(fetchQuery(mockQueryRef, { id: '1' })).rejects.toThrow(/NG_APP_CONVEX_URL/i);
    expect(MockedConvexHttpClient).not.toHaveBeenCalled();
  });

  it('throws a focused error when no deployment URL is available', async () => {
    delete process.env.NG_APP_CONVEX_URL;
    delete process.env[legacyNextStyleConvexUrlEnv];

    await expect(fetchQuery(mockQueryRef, { id: '1' })).rejects.toThrow(
      /Convex deployment URL is missing/i,
    );
    expect(MockedConvexHttpClient).not.toHaveBeenCalled();
  });
});
