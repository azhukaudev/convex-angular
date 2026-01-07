import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConvexClient } from 'convex/browser';

import { CONVEX } from '../tokens/convex';
import { injectConvex } from './inject-convex';

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

    expect(() => TestBed.createComponent(TestComponent)).toThrow();
  });
});
