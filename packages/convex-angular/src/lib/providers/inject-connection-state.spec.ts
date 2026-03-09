import { Component, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectionState, ConvexClient } from 'convex/browser';

import { CONVEX } from '../tokens/convex';
import { injectConvexConnectionState } from './inject-connection-state';

describe('injectConvexConnectionState', () => {
  let mockConvexClient: jest.Mocked<ConvexClient>;
  let mockUnsubscribe: jest.Mock;
  let currentConnectionState: ConnectionState;
  let connectionStateSubscriber: ((state: ConnectionState) => void) | undefined;

  beforeEach(() => {
    currentConnectionState = {
      hasInflightRequests: false,
      isWebSocketConnected: true,
      timeOfOldestInflightRequest: null,
      hasEverConnected: true,
      connectionCount: 1,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    };

    mockUnsubscribe = jest.fn();

    mockConvexClient = {
      connectionState: jest.fn(() => currentConnectionState),
      subscribeToConnectionState: jest.fn((subscriber) => {
        connectionStateSubscriber = subscriber;
        return mockUnsubscribe;
      }),
    } as unknown as jest.Mocked<ConvexClient>;

    TestBed.configureTestingModule({
      providers: [{ provide: CONVEX, useValue: mockConvexClient }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns the current connection state and subscribes to updates', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly connectionState = injectConvexConnectionState();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.connectionState()).toEqual(currentConnectionState);
    expect(mockConvexClient.connectionState).toHaveBeenCalledTimes(1);
    expect(mockConvexClient.subscribeToConnectionState).toHaveBeenCalledTimes(1);
  });

  it('updates reactively when connection state changes', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly connectionState = injectConvexConnectionState();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    const nextState: ConnectionState = {
      ...currentConnectionState,
      isWebSocketConnected: false,
      hasInflightRequests: true,
      connectionRetries: 2,
      timeOfOldestInflightRequest: new Date(1700000000000),
    };

    expect(connectionStateSubscriber).toBeDefined();
    connectionStateSubscriber?.(nextState);

    expect(fixture.componentInstance.connectionState()).toEqual(nextState);
  });

  it('unsubscribes when destroyed', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      readonly connectionState = injectConvexConnectionState();
    }

    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();
    fixture.destroy();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('resolves outside an injection context with injectRef', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const connectionState = injectConvexConnectionState({ injectRef: injector });

    expect(connectionState()).toEqual(currentConnectionState);
  });

  it('throws outside an injection context without injectRef', () => {
    expect(() => injectConvexConnectionState()).toThrow();
  });
});
