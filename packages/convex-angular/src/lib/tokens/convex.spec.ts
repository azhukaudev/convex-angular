import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ConvexHydrationState } from '../ssr/state-transfer';
import { CONVEX_SSR_CONFIG } from '../ssr/tokens';
import { CONVEX, provideConvex } from './convex';

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
          webSocketConstructor: class {
            close() {}
            addEventListener() {}
            removeEventListener() {}
            send() {}
          } as unknown as typeof WebSocket,
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
});
