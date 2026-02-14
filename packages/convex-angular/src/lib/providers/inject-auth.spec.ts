import { Component, Injectable, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX_AUTH, ConvexAuthProvider } from '../tokens/auth';
import { CONVEX } from '../tokens/convex';
import {
  injectAuth,
  provideConvexAuth,
  provideConvexAuthFromExisting,
} from './inject-auth';

/**
 * Mock auth provider for testing
 */
@Injectable()
class MockAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly tokenToReturn: string | null = 'token';

  async fetchAccessToken(_args: {
    forceRefreshToken: boolean;
  }): Promise<string | null> {
    return this.tokenToReturn;
  }
}

@Injectable()
class ExistingAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly fetchAccessToken = jest.fn(
    async (_args: { forceRefreshToken: boolean }) => 'token',
  );
}

@Injectable()
class MethodFetchAuthProvider implements ConvexAuthProvider {
  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(true);

  async fetchAccessToken(_args: {
    forceRefreshToken: boolean;
  }): Promise<string | null> {
    return this.isAuthenticated() ? 'method-token' : null;
  }
}

describe('injectAuth', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockSetAuth: jest.Mock;
  let mockClearAuth: jest.Mock;
  let mockHasAuth: jest.Mock;
  let setAuthOnChange: ((isAuthenticated: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetAuth = jest.fn((_fetchToken, onChange) => {
      setAuthOnChange = onChange;
    });
    mockClearAuth = jest.fn();
    mockHasAuth = jest.fn().mockReturnValue(false);

    mockConvexClient = {
      setAuth: mockSetAuth,
      client: {
        clearAuth: mockClearAuth,
        hasAuth: mockHasAuth,
      },
    } as unknown as jest.Mocked<ConvexClient>;

    setAuthOnChange = undefined;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('without auth provider', () => {
    it('should throw an error when no auth provider is configured', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: CONVEX, useValue: mockConvexClient }],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      expect(() => TestBed.createComponent(TestComponent)).toThrow(
        /Could not find `CONVEX_AUTH_CONFIG`/,
      );
    });
  });

  describe('initial state', () => {
    it('should be loading when auth provider is loading', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(true),
        isAuthenticated: signal(false),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.isLoading()).toBe(true);
      expect(fixture.componentInstance.auth.status()).toBe('loading');
    }));

    it('should be unauthenticated when provider says not authenticated', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(false),
        fetchAccessToken: async () => null,
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.isLoading()).toBe(false);
      expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    }));

    it('should be authenticated immediately when provider is authenticated', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Should be authenticated immediately (trusts provider)
      expect(fixture.componentInstance.auth.isLoading()).toBe(false);
      expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    }));

    it('should have no error initially', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(false),
        fetchAccessToken: async () => null,
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.error()).toBeUndefined();
    }));
  });

  describe('authentication flow', () => {
    it('should call setAuth on ConvexClient when provider is authenticated', fakeAsync(() => {
      const fetchAccessToken = jest.fn().mockResolvedValue('test-token');
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken,
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
      );
    }));

    it('should become authenticated immediately when provider is authenticated', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Immediately authenticated (trusts provider, doesn't wait for Convex)
      expect(fixture.componentInstance.auth.isLoading()).toBe(false);
      expect(fixture.componentInstance.auth.isAuthenticated()).toBe(true);
      expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    }));

    it('should not call setAuth when provider is not authenticated', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(false),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      expect(mockSetAuth).not.toHaveBeenCalled();
    }));
  });

  describe('state transitions', () => {
    it('should transition from loading to authenticated', fakeAsync(() => {
      const isLoading = signal(true);
      const isAuthenticated = signal(false);
      const mockProvider: ConvexAuthProvider = {
        isLoading,
        isAuthenticated,
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Initially loading
      expect(fixture.componentInstance.auth.status()).toBe('loading');

      // Provider finishes loading and is authenticated
      isLoading.set(false);
      isAuthenticated.set(true);
      fixture.detectChanges();
      tick();

      // Immediately authenticated (trusts provider, doesn't wait for Convex confirmation)
      expect(fixture.componentInstance.auth.status()).toBe('authenticated');
    }));

    it('should transition from authenticated to unauthenticated', fakeAsync(() => {
      const isLoading = signal(false);
      const isAuthenticated = signal(true);
      const mockProvider: ConvexAuthProvider = {
        isLoading,
        isAuthenticated,
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      setAuthOnChange?.(true);
      fixture.detectChanges();
      expect(fixture.componentInstance.auth.status()).toBe('authenticated');

      // User logs out
      mockHasAuth.mockReturnValue(true);
      isAuthenticated.set(false);
      fixture.detectChanges();
      tick();

      expect(mockClearAuth).toHaveBeenCalled();
      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
      expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
    }));

    it('should transition back to loading when provider goes back to loading', fakeAsync(() => {
      const isLoading = signal(false);
      const isAuthenticated = signal(true);
      const mockProvider: ConvexAuthProvider = {
        isLoading,
        isAuthenticated,
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms authentication
      setAuthOnChange?.(true);
      fixture.detectChanges();
      expect(fixture.componentInstance.auth.status()).toBe('authenticated');

      // Provider goes back to loading (e.g., re-authenticating)
      isLoading.set(true);
      fixture.detectChanges();
      tick();

      expect(fixture.componentInstance.auth.status()).toBe('loading');
    }));
  });

  describe('multiple injectAuth calls', () => {
    it('should share state between multiple calls in same component', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth1 = injectAuth();
        readonly auth2 = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex confirms
      setAuthOnChange?.(true);
      fixture.detectChanges();

      // Both should reflect the same state
      expect(fixture.componentInstance.auth1.isAuthenticated()).toBe(true);
      expect(fixture.componentInstance.auth2.isAuthenticated()).toBe(true);
    }));

    it('should share state between different components', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken: async () => 'token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent1 {
        readonly auth = injectAuth();
      }

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent2 {
        readonly auth = injectAuth();
      }

      const fixture1 = TestBed.createComponent(TestComponent1);
      fixture1.detectChanges();
      tick();

      const fixture2 = TestBed.createComponent(TestComponent2);
      fixture2.detectChanges();
      tick();

      // Convex confirms
      setAuthOnChange?.(true);
      fixture1.detectChanges();
      fixture2.detectChanges();

      // Both should reflect the same state
      expect(fixture1.componentInstance.auth.isAuthenticated()).toBe(true);
      expect(fixture2.componentInstance.auth.isAuthenticated()).toBe(true);
    }));
  });

  describe('convex callback', () => {
    it('should handle Convex reporting not authenticated', fakeAsync(() => {
      const mockProvider: ConvexAuthProvider = {
        isLoading: signal(false),
        isAuthenticated: signal(true),
        fetchAccessToken: async () => 'invalid-token',
      };

      TestBed.configureTestingModule({
        providers: [
          { provide: CONVEX, useValue: mockConvexClient },
          { provide: CONVEX_AUTH, useValue: mockProvider },
          provideConvexAuth(),
        ],
      });

      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly auth = injectAuth();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();
      tick();

      // Convex reports not authenticated (token invalid/expired)
      setAuthOnChange?.(false);
      fixture.detectChanges();

      // Provider says authenticated but Convex says no
      expect(fixture.componentInstance.auth.isAuthenticated()).toBe(false);
      expect(fixture.componentInstance.auth.isLoading()).toBe(false);
      expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
    }));
  });
});

describe('provideConvexAuth', () => {
  it('should auto-initialize auth sync', fakeAsync(() => {
    const fetchAccessToken = jest.fn().mockResolvedValue('token');
    const mockProvider: ConvexAuthProvider = {
      isLoading: signal(false),
      isAuthenticated: signal(true),
      fetchAccessToken,
    };

    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useValue: mockProvider },
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {}

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.setAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
    );
  }));

  it('should preserve provider context for method-based fetchAccessToken', fakeAsync(() => {
    let setAuthFetcher: ConvexAuthProvider['fetchAccessToken'] | undefined;

    const mockConvexClient = {
      setAuth: jest.fn((fetchToken: ConvexAuthProvider['fetchAccessToken']) => {
        setAuthFetcher = fetchToken;
      }),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useClass: MethodFetchAuthProvider },
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {}

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(setAuthFetcher).toBeDefined();

    let token: string | null | undefined;
    let error: unknown;
    setAuthFetcher!({ forceRefreshToken: false }).then(
      (value) => {
        token = value;
      },
      (err) => {
        error = err;
      },
    );
    tick();

    expect(error).toBeUndefined();
    expect(token).toBe('method-token');
  }));

  it('should work with TestBed using CONVEX_AUTH token', fakeAsync(() => {
    const mockProvider: ConvexAuthProvider = {
      isLoading: signal(false),
      isAuthenticated: signal(false),
      fetchAccessToken: async () => null,
    };

    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useValue: mockProvider },
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));

  it('should work with useClass for injectable services', fakeAsync(() => {
    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        { provide: CONVEX_AUTH, useClass: MockAuthProvider },
        provideConvexAuth(),
      ],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));
});

describe('provideConvexAuthFromExisting', () => {
  it('should reuse the existing provider instance and sync auth transitions', fakeAsync(() => {
    const mockHasAuth = jest.fn().mockReturnValue(false);

    const mockConvexClient = {
      setAuth: jest.fn(),
      client: {
        clearAuth: jest.fn(),
        hasAuth: mockHasAuth,
      },
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [
        { provide: CONVEX, useValue: mockConvexClient },
        ExistingAuthProvider,
        provideConvexAuthFromExisting(ExistingAuthProvider),
      ],
    });

    const existingProvider = TestBed.inject(ExistingAuthProvider);
    const providerViaToken = TestBed.inject(CONVEX_AUTH);

    expect(providerViaToken).toBe(existingProvider);

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly auth = injectAuth();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.setAuth).not.toHaveBeenCalled();

    existingProvider.isAuthenticated.set(true);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.setAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
    );

    mockHasAuth.mockReturnValue(true);
    existingProvider.isAuthenticated.set(false);
    fixture.detectChanges();
    tick();

    expect(mockConvexClient.client.clearAuth).toHaveBeenCalled();
    expect(fixture.componentInstance.auth.status()).toBe('unauthenticated');
  }));
});
