import { Component, computed } from '@angular/core';
import { injectConvexConnectionState } from 'convex-angular';

@Component({
  selector: 'app-connection-indicator',
  template: `
    <span [class]="tone()">{{ label() }}</span>
    @if (state().hasInflightRequests) {
      <span>{{ state().inflightMutations }} mutations, {{ state().inflightActions }} actions in flight</span>
    }
  `,
})
export class ConnectionIndicatorComponent {
  readonly state = injectConvexConnectionState();

  readonly label = computed(() => {
    const state = this.state();
    if (state.isWebSocketConnected) {
      return state.hasInflightRequests ? 'Syncing' : 'Live';
    }
    // connectionRetries only advances while the client is failing to connect.
    if (state.connectionRetries > 0) {
      return `Reconnecting (attempt ${state.connectionRetries})`;
    }
    return state.hasEverConnected ? 'Offline' : 'Connecting';
  });

  readonly tone = computed(() => (this.state().isWebSocketConnected ? 'ok' : 'warn'));

  // A connection that keeps dropping is worth surfacing even while it is up.
  readonly isUnstable = computed(() => this.state().connectionCount > 3);

  readonly oldestRequestAge = computed(() => {
    const since = this.state().timeOfOldestInflightRequest;
    return since === null ? 0 : Date.now() - since.getTime();
  });
}
