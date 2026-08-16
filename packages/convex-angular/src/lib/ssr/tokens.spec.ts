import { TestBed } from '@angular/core/testing';

import { CONVEX_HTTP_CLIENT, CONVEX_SSR_CONFIG } from './tokens';

describe('SSR tokens', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should name CONVEX_SSR_CONFIG when provideConvex was not registered', () => {
    expect(() => TestBed.inject(CONVEX_SSR_CONFIG)).toThrow(/CONVEX_SSR_CONFIG/);
  });

  it('should name CONVEX_HTTP_CLIENT when provideConvex was not registered', () => {
    expect(() => TestBed.inject(CONVEX_HTTP_CLIENT)).toThrow(/CONVEX_HTTP_CLIENT/);
  });
});
