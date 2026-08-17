import { Component, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockConvexClient, provideConvexTesting } from 'convex-angular/testing';
import { ConnectionState } from 'convex/browser';

import { injectConvexConnectionState } from './inject-connection-state';

// The connected, idle state a fresh MockConvexClient reports.
const CONNECTED_STATE: ConnectionState = {
  hasInflightRequests: false,
  isWebSocketConnected: true,
  timeOfOldestInflightRequest: null,
  hasEverConnected: true,
  connectionCount: 1,
  connectionRetries: 0,
  inflightMutations: 0,
  inflightActions: 0,
};

describe('injectConvexConnectionState', () => {
  let convex: MockConvexClient;

  beforeEach(() => {
    convex = new MockConvexClient();

    TestBed.configureTestingModule({
      providers: [provideConvexTesting(convex)],
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

    expect(fixture.componentInstance.connectionState()).toEqual(CONNECTED_STATE);
    expect(convex.connectionStateReads).toBe(1);
    expect(convex.connectionStateSubscriptions).toBe(1);
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
      ...CONNECTED_STATE,
      isWebSocketConnected: false,
      hasInflightRequests: true,
      connectionRetries: 2,
      timeOfOldestInflightRequest: new Date(1700000000000),
    };

    expect(convex.connectionStateSubscriptions).toBe(1);
    convex.setConnectionState(nextState);

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

    expect(convex.connectionStateUnsubscribes).toBe(1);

    convex.setConnectionState({ isWebSocketConnected: false, connectionRetries: 2 });

    // The client moved on, but the destroyed helper is no longer listening.
    expect(convex.connectionState().isWebSocketConnected).toBe(false);
    expect(fixture.componentInstance.connectionState()).toEqual(CONNECTED_STATE);
  });

  it('resolves outside an injection context with injectRef', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const connectionState = injectConvexConnectionState({ injectRef: injector });

    expect(connectionState()).toEqual(CONNECTED_STATE);
  });

  it('throws outside an injection context without injectRef', () => {
    expect(() => injectConvexConnectionState()).toThrow();
  });

  describe('disabled client (SSR)', () => {
    let disabledConvex: MockConvexClient;

    beforeEach(() => {
      TestBed.resetTestingModule();
      disabledConvex = new MockConvexClient({ disabled: true });

      TestBed.configureTestingModule({
        providers: [provideConvexTesting(disabledConvex)],
      });
    });

    it('returns a disconnected default state without touching the client', () => {
      @Component({
        template: '',
        standalone: true,
      })
      class TestComponent {
        readonly connectionState = injectConvexConnectionState();
      }

      const fixture = TestBed.createComponent(TestComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.connectionState()).toEqual({
        hasInflightRequests: false,
        isWebSocketConnected: false,
        timeOfOldestInflightRequest: null,
        hasEverConnected: false,
        connectionCount: 0,
        connectionRetries: 0,
        inflightMutations: 0,
        inflightActions: 0,
      });
      // The mock counts attempts even while disabled, so zero here means the
      // helper never reached for the connection-state APIs at all.
      expect(disabledConvex.connectionStateReads).toBe(0);
      expect(disabledConvex.connectionStateSubscriptions).toBe(0);
    });
  });
});
