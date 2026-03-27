import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX, provideConvex } from '../tokens/convex';
import { injectConvex } from './inject-convex';

let mockConstructedConvexClient: ConvexClient;
const mockConvexClientConstructor = jest.fn(() => mockConstructedConvexClient);

jest.mock('convex/browser', () => {
  const actual = jest.requireActual('convex/browser');
  const MockConvexClient = jest.fn().mockImplementation(() => mockConvexClientConstructor());
  MockConvexClient.prototype = actual.ConvexClient.prototype;

  return {
    ...actual,
    ConvexClient: MockConvexClient,
  };
});

describe('injectConvex', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;

  beforeEach(() => {
    mockConvexClient = {
      query: jest.fn(),
      mutation: jest.fn(),
      action: jest.fn(),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should return the injected ConvexClient', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.convex).toBe(mockConvexClient);
  });

  it('should provide access to client methods', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.convex.query).toBeDefined();
    expect(fixture.componentInstance.convex.mutation).toBeDefined();
    expect(fixture.componentInstance.convex.action).toBeDefined();
  });

  it('should throw error when CONVEX token is not provided', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/Could not find `CONVEX`/);
  });

  it('should resolve the ConvexClient outside an injection context with injectRef', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    expect(injectConvex({ injectRef: injector })).toBe(mockConvexClient);
  });

  it('should throw outside an injection context without injectRef', () => {
    expect(() => injectConvex()).toThrow();
  });
});

describe('provideConvex configuration', () => {
  let createdClient: jest.Mocked<ConvexClient>;

  beforeEach(() => {
    createdClient = {
      client: {
        localQueryResult: jest.fn(),
        hasAuth: jest.fn().mockReturnValue(false),
        clearAuth: jest.fn(),
      },
      query: jest.fn(),
      mutation: jest.fn(),
      action: jest.fn(),
      onUpdate: jest.fn(),
      connectionState: jest.fn(),
      subscribeToConnectionState: jest.fn(),
      setAuth: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<ConvexClient>;

    mockConstructedConvexClient = createdClient;
    mockConvexClientConstructor.mockClear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should throw when provideConvex is registered multiple times in one injector', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://first.convex.cloud'), provideConvex('https://second.convex.cloud')],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    expect(() => TestBed.createComponent(TestComponent)).toThrow(/registered more than once in the same injector/);
  });

  it('should throw when provideConvex is registered in a child injector', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://root.convex.cloud')],
    });

    const rootInjector = TestBed.inject(EnvironmentInjector);

    expect(() => createEnvironmentInjector([provideConvex('https://child.convex.cloud')], rootInjector)).toThrow(
      /must be configured only in your root application providers/,
    );
  });

  it('does not instantiate the underlying ConvexClient when it is only injected', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://root.convex.cloud')],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.convex).toBeDefined();
    expect(mockConvexClientConstructor).not.toHaveBeenCalled();
  });

  it('instantiates the underlying ConvexClient on first client method use', () => {
    TestBed.configureTestingModule({
      providers: [provideConvex('https://root.convex.cloud')],
    });

    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly convex = injectConvex();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(mockConvexClientConstructor).not.toHaveBeenCalled();

    void fixture.componentInstance.convex.query((() => {}) as any, {} as any);
    void fixture.componentInstance.convex.mutation((() => {}) as any, {} as any);

    expect(mockConvexClientConstructor).toHaveBeenCalledTimes(1);
  });

  it('closes the instantiated ConvexClient when the injector is destroyed', () => {
    TestBed.configureTestingModule({ providers: [] });
    const injector = createEnvironmentInjector(
      [provideConvex('https://root.convex.cloud')],
      TestBed.inject(EnvironmentInjector),
    );

    const convex = injectConvex({ injectRef: injector });

    void convex.query((() => {}) as any, {} as any);
    expect(mockConvexClientConstructor).toHaveBeenCalledTimes(1);

    injector.destroy();

    expect(createdClient.close).toHaveBeenCalledTimes(1);
  });
});
