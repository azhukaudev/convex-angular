import { DatePipe, JsonPipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { injectConvexConnectionState } from 'convex-angular';
import { ConnectionState } from 'convex/browser';
import { CardModule } from 'primeng/card';

import { ExamplePageHeaderComponent } from '../shared/example-page-header/example-page-header';

type ConnectionLogEntry = {
  signature: string;
  timestamp: Date;
  title: string;
  details: string;
};

@Component({
  imports: [DatePipe, JsonPipe, NgClass, CardModule, ExamplePageHeaderComponent],
  selector: 'cva-connection-state-demo',
  templateUrl: 'connection-state-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class ConnectionStateDemo {
  private readonly destroyRef = inject(DestroyRef);

  readonly pageLinks = [
    { href: '/examples/basic', label: 'Basic Example' },
    { href: '/examples/paginated', label: 'Paginated Example' },
    { href: '/examples/multi-query', label: 'Multi-query Example' },
    { href: '/auth/login', label: 'Auth Example' },
  ];

  readonly connectionState = injectConvexConnectionState();
  readonly now = signal(Date.now());
  readonly logEntries = signal<ConnectionLogEntry[]>([]);

  readonly statusLabel = computed(() => {
    const state = this.connectionState();
    if (state.isWebSocketConnected) {
      return 'Connected';
    }
    if (!state.hasEverConnected) {
      return 'Connecting';
    }
    if (state.connectionRetries > 0 || state.hasInflightRequests) {
      return 'Reconnecting';
    }
    return 'Disconnected';
  });

  readonly statusTone = computed<'success' | 'warn' | 'danger'>(() => {
    switch (this.statusLabel()) {
      case 'Connected':
        return 'success';
      case 'Connecting':
      case 'Reconnecting':
        return 'warn';
      default:
        return 'danger';
    }
  });

  readonly statusDescription = computed(() => {
    const state = this.connectionState();
    if (state.isWebSocketConnected && state.hasInflightRequests) {
      return 'WebSocket connected. Convex is actively processing live work.';
    }
    if (state.isWebSocketConnected) {
      return 'WebSocket connected and ready for live queries, mutations, and actions.';
    }
    if (!state.hasEverConnected) {
      return 'Waiting for the first successful Convex WebSocket connection.';
    }
    if (state.connectionRetries > 0) {
      return `Connection is retrying after interruption. Retry count: ${state.connectionRetries}.`;
    }
    return 'Convex is disconnected. Check network state and client configuration.';
  });

  readonly oldestInflightLabel = computed(() => {
    const oldestInflight = this.connectionState().timeOfOldestInflightRequest;
    if (oldestInflight === null) {
      return 'none';
    }

    const elapsedSeconds = Math.max(0, Math.floor((this.now() - oldestInflight.getTime()) / 1000));
    return `${elapsedSeconds}s ago`;
  });

  readonly transportFacts = computed(() => {
    const state = this.connectionState();
    return [
      {
        label: 'WebSocket',
        value: state.isWebSocketConnected ? 'online' : 'offline',
      },
      {
        label: 'Ever Connected',
        value: state.hasEverConnected ? 'yes' : 'no',
      },
      {
        label: 'Inflight Requests',
        value: state.hasInflightRequests ? 'yes' : 'no',
      },
      {
        label: 'Connection Count',
        value: String(state.connectionCount),
      },
    ];
  });

  constructor() {
    const intervalId = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));

    effect(() => {
      const state = this.connectionState();
      const signature = this.createSignature(state);
      const entry: ConnectionLogEntry = {
        signature,
        timestamp: new Date(),
        title: this.statusLabel(),
        details: this.describeStateChange(state),
      };

      this.logEntries.update((entries) => {
        if (entries[0]?.signature === signature) {
          return entries;
        }
        return [entry, ...entries].slice(0, 10);
      });
    });
  }

  private createSignature(state: ConnectionState): string {
    return JSON.stringify({
      isWebSocketConnected: state.isWebSocketConnected,
      hasEverConnected: state.hasEverConnected,
      hasInflightRequests: state.hasInflightRequests,
      inflightMutations: state.inflightMutations,
      inflightActions: state.inflightActions,
      connectionCount: state.connectionCount,
      connectionRetries: state.connectionRetries,
      timeOfOldestInflightRequest: state.timeOfOldestInflightRequest?.toISOString() ?? null,
    });
  }

  private describeStateChange(state: ConnectionState): string {
    const oldestInflight = state.timeOfOldestInflightRequest
      ? state.timeOfOldestInflightRequest.toLocaleTimeString()
      : 'none';
    return `retries ${state.connectionRetries}, inflight ${state.inflightMutations} mutations / ${state.inflightActions} actions, oldest request ${oldestInflight}`;
  }
}
