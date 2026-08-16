import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConvexHttpClient } from 'convex/browser';

import { ConvexHydrationState } from '../ssr/state-transfer';
import { CONVEX_HTTP_CLIENT, CONVEX_SSR_CONFIG } from '../ssr/tokens';
import { CONVEX, provideConvex } from './convex';

// Enough of the WebSocket surface for ConvexClient to construct and close
// without opening a real connection.
const fakeWebSocketConstructor = class {
  close() {}
  addEventListener() {}
  removeEventListener() {}
  send() {}
} as unknown as typeof WebSocket;

function captureThrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}

describe('provideConvex (SSR)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create a disabled client on the server platform', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideConvex('https://test.convex.cloud', { ssr: { fetchOnServer: true } }),
      ],
    });

    const client = TestBed.inject(CONVEX);
    expect(client.disabled).toBe(true);
  });

  it('should create an enabled client on the browser platform', () => {
    TestBed.configureTestingModule({
      providers: [
        provideConvex('https://test.convex.cloud', {
          // Avoid opening a real WebSocket in tests.
          webSocketConstructor: fakeWebSocketConstructor,
        }),
      ],
    });

    const client = TestBed.inject(CONVEX);
    expect(client.disabled).toBe(false);
  });

  it('should expose the SSR config and hydration services', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideConvex('https://test.convex.cloud', { ssr: { fetchOnServer: false } }),
      ],
    });

    expect(TestBed.inject(CONVEX_SSR_CONFIG)).toEqual({
      url: 'https://test.convex.cloud',
      ssr: { fetchOnServer: false },
    });
    expect(TestBed.inject(ConvexHydrationState)).toBeInstanceOf(ConvexHydrationState);
  });

  it('should provide an HTTP client pointed at the deployment', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }, provideConvex('https://test.convex.cloud')],
    });

    expect(TestBed.inject(CONVEX_HTTP_CLIENT)).toBeInstanceOf(ConvexHttpClient);
  });
});

describe('provideConvex (client construction)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should forward ConvexClient options to the client', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        // `.convex.site` is rejected by ConvexClient unless the check is
        // explicitly skipped, so constructing at all proves the option arrived.
        provideConvex('https://test.convex.site', { skipConvexDeploymentUrlCheck: true }),
      ],
    });

    expect(TestBed.inject(CONVEX).disabled).toBe(true);
  });

  it('should close the client when the injector is destroyed', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://test.convex.cloud', { webSocketConstructor: fakeWebSocketConstructor })],
    });
    const client = TestBed.inject(CONVEX);
    expect(client.closed).toBe(false);

    TestBed.resetTestingModule();

    expect(client.closed).toBe(true);
  });
});

describe('provideConvex (provider placement)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should name the token when no provider is registered', () => {
    TestBed.configureTestingModule({ providers: [] });

    expect(() => TestBed.inject(CONVEX)).toThrow(/CONVEX/);
  });

  it('should reject a second registration in the same injector', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://test.convex.cloud'), provideConvex('https://test.convex.cloud')],
    });

    const error = captureThrown(() => TestBed.inject(CONVEX));

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/registered more than once/);
    expect(error.message).toMatch(/exactly once in your root application providers/);
  });

  it('should reject a nested registration below a root registration', () => {
    TestBed.configureTestingModule({ providers: [provideConvex('https://test.convex.cloud')] });
    const rootInjector = TestBed.inject(EnvironmentInjector);

    const error = captureThrown(() =>
      createEnvironmentInjector([provideConvex('https://test.convex.cloud')], rootInjector),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/only in your root application providers/);
    expect(error.message).toMatch(/Remove nested or route-level registrations/);
  });
});
