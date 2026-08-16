import { TestBed } from '@angular/core/testing';

import { CONVEX_AUTH } from './auth';

describe('CONVEX_AUTH', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should name the token when no auth provider is registered', () => {
    TestBed.configureTestingModule({ providers: [] });

    expect(() => TestBed.inject(CONVEX_AUTH)).toThrow(/CONVEX_AUTH/);
  });
});
