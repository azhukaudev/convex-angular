import { PendingTasks, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FunctionReference } from 'convex/server';

import { QueryReference } from '../providers/inject-query';
import { ConvexServerQueryLoader } from './server-query-loader';
import { makeQueryStateKey } from './state-transfer';
import { CONVEX_HTTP_CLIENT, CONVEX_SSR_CONFIG, ConvexSsrOptions } from './tokens';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:list'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string }>
> as QueryReference;

describe('ConvexServerQueryLoader', () => {
  let mockHttpQuery: jest.Mock;
  let mockSetAuth: jest.Mock;

  function setup(ssr: ConvexSsrOptions = {}) {
    TestBed.configureTestingModule({
      providers: [
        ConvexServerQueryLoader,
        { provide: CONVEX_SSR_CONFIG, useValue: { url: 'https://test.convex.cloud', ssr } },
        { provide: CONVEX_HTTP_CLIENT, useValue: { query: mockHttpQuery, setAuth: mockSetAuth } },
      ],
    });
    return TestBed.inject(ConvexServerQueryLoader);
  }

  beforeEach(() => {
    mockHttpQuery = jest.fn().mockResolvedValue([{ _id: '1' }]);
    mockSetAuth = jest.fn();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should fetch over HTTP and write the result into TransferState', async () => {
    const loader = setup();

    const result = await loader.fetch(mockQuery, { count: 10 }, '{"count":10}');

    expect(result).toEqual([{ _id: '1' }]);
    expect(mockHttpQuery).toHaveBeenCalledWith(mockQuery, { count: 10 });

    const transferState = TestBed.inject(TransferState);
    const key = makeQueryStateKey('todos:list', '{"count":10}');
    expect(transferState.get(key, null)).toEqual({ d: [{ _id: '1' }] });
  });

  it('should dedupe concurrent fetches for the same query and args', async () => {
    const loader = setup();

    const first = loader.fetch(mockQuery, { count: 10 }, '{"count":10}');
    const second = loader.fetch(mockQuery, { count: 10 }, '{"count":10}');

    expect(second).toBe(first);
    await first;
    expect(mockHttpQuery).toHaveBeenCalledTimes(1);
  });

  it('should fetch separately for different args', async () => {
    const loader = setup();

    await loader.fetch(mockQuery, { count: 10 }, '{"count":10}');
    await loader.fetch(mockQuery, { count: 20 }, '{"count":20}');

    expect(mockHttpQuery).toHaveBeenCalledTimes(2);
  });

  it('should resolve the auth token once and apply it before querying', async () => {
    const authToken = jest.fn().mockResolvedValue('jwt-token');
    const loader = setup({ authToken });

    await loader.fetch(mockQuery, { count: 10 }, '{"count":10}');
    await loader.fetch(mockQuery, { count: 20 }, '{"count":20}');

    expect(authToken).toHaveBeenCalledTimes(1);
    expect(mockSetAuth).toHaveBeenCalledWith('jwt-token');
    expect(mockSetAuth.mock.invocationCallOrder[0]).toBeLessThan(mockHttpQuery.mock.invocationCallOrder[0]);
  });

  it('should not apply auth when the token factory returns null', async () => {
    const loader = setup({ authToken: () => null });

    await loader.fetch(mockQuery, { count: 10 }, '{"count":10}');

    expect(mockSetAuth).not.toHaveBeenCalled();
  });

  it('should propagate fetch errors and transfer nothing', async () => {
    mockHttpQuery.mockRejectedValue(new Error('boom'));
    const loader = setup();

    await expect(loader.fetch(mockQuery, { count: 10 }, '{"count":10}')).rejects.toThrow('boom');

    const transferState = TestBed.inject(TransferState);
    expect(transferState.hasKey(makeQueryStateKey('todos:list', '{"count":10}'))).toBe(false);
  });

  it('should block stability via a pending task until the fetch settles', async () => {
    const loader = setup();
    const pendingTasks = TestBed.inject(PendingTasks);
    const removeTask = jest.fn();
    const addSpy = jest.spyOn(pendingTasks, 'add').mockReturnValue(removeTask);

    const fetchPromise = loader.fetch(mockQuery, { count: 10 }, '{"count":10}');
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeTask).not.toHaveBeenCalled();

    await fetchPromise;
    expect(removeTask).toHaveBeenCalledTimes(1);
  });

  it('should release the pending task when the fetch fails', async () => {
    mockHttpQuery.mockRejectedValue(new Error('boom'));
    const loader = setup();
    const pendingTasks = TestBed.inject(PendingTasks);
    const removeTask = jest.fn();
    jest.spyOn(pendingTasks, 'add').mockReturnValue(removeTask);

    await expect(loader.fetch(mockQuery, { count: 10 }, '{"count":10}')).rejects.toThrow('boom');
    expect(removeTask).toHaveBeenCalledTimes(1);
  });

  it('should report enabled=false when fetchOnServer is disabled', () => {
    const loader = setup({ fetchOnServer: false });
    expect(loader.enabled).toBe(false);
  });

  it('should report enabled=true by default', () => {
    const loader = setup();
    expect(loader.enabled).toBe(true);
  });
});
