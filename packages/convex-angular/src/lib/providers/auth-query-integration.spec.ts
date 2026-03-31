import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';
import { FunctionReference } from 'convex/server';

import { skipToken } from '../skip-token';
import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { CONVEX } from '../tokens/convex';
import { injectAuth, provideConvexAuth } from './inject-auth';
import { QueryReference, injectQuery } from './inject-query';

jest.mock('convex/server', () => ({
  ...jest.requireActual('convex/server'),
  getFunctionName: jest.fn().mockReturnValue('todos:listTodos'),
}));

const mockQuery = (() => {}) as unknown as FunctionReference<
  'query',
  'public',
  { count: number },
  Array<{ _id: string; title: string }>
> as QueryReference;

describe('auth/query integration', () => {
  let callLog: string[];
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let mockClearAuth: jest.Mock;
  let mockHasAuth: jest.Mock;
  let providerLoading: ReturnType<typeof signal<boolean>>;
  let providerAuthenticated: ReturnType<typeof signal<boolean>>;
  let providerError: ReturnType<typeof signal<Error | undefined>>;
  let reauthVersion: ReturnType<typeof signal<number>>;
  let fetchAccessToken: jest.Mock<Promise<string | null | undefined>, [{ forceRefreshToken: boolean }]>;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

  function createProvider(): ConvexAuthProvider {
    return {
      isLoading: providerLoading,
      isAuthenticated: providerAuthenticated,
      error: providerError,
      reauthVersion,
      fetchAccessToken,
    };
  }

  beforeEach(() => {
    callLog = [];
    providerLoading = signal(false);
    providerAuthenticated = signal(true);
    providerError = signal<Error | undefined>(undefined);
    reauthVersion = signal(0);
    fetchAccessToken = jest.fn().mockResolvedValue('token');
    setAuthOnChange = undefined;

    mockSetAuth = jest.fn((_fetchToken, onChange) => {
      callLog.push('auth:set');
      setAuthOnChange = onChange;
    });
    mockClearAuth = jest.fn(() => {
      callLog.push('auth:clear');
    });
    mockHasAuth = jest.fn().mockReturnValue(false);

    mockConvexClient = {
      setAuth: mockSetAuth,
      client: {
        clearAuth: mockClearAuth,
        hasAuth: mockHasAuth,
        localQueryResult: jest.fn().mockReturnValue(undefined),
      },
      onUpdate: jest.fn(() => {
        callLog.push('query:subscribe');
        return () => {
          callLog.push('query:unsubscribe');
        };
      }),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useValue: createProvider() },
        provideConvexAuth(),
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('unsubscribes auth-gated queries before clearing auth on logout', fakeAsync(() => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
      readonly todos = injectQuery(mockQuery, () => (providerAuthenticated() ? { count: 10 } : skipToken));
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    setAuthOnChange?.(true);
    fixture.detectChanges();
    tick();

    mockHasAuth.mockReturnValue(true);
    callLog = [];

    providerAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(callLog).toContain('query:unsubscribe');
    expect(callLog).toContain('auth:clear');
    expect(callLog.indexOf('query:unsubscribe')).toBeLessThan(callLog.indexOf('auth:clear'));
  }));
});
