import { Component } from '@angular/core';
import { injectAuth } from 'convex-angular';

@Component({
  selector: 'app-auth-status',
  template: `
    @switch (auth.status()) {
      @case ('loading') {
        <p>Checking your session…</p>
      }
      @case ('authenticated') {
        <p>Signed in.</p>
      }
      @case ('refreshing') {
        <!-- Still signed in: the socket is paused while a replacement token is fetched. -->
        <p>Signed in.</p>
        <p role="status">Reconnecting your session…</p>
      }
      @case ('unauthenticated') {
        <p>Signed out.</p>
      }
    }

    @if (auth.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
  `,
})
export class AuthStatusComponent {
  readonly auth = injectAuth();

  // `getAuth()` is a snapshot method, not a signal: read it on demand, right
  // before you need the token. It returns undefined when no token is set and
  // during server-side rendering.
  callExternalApi(): Promise<Response> {
    const snapshot = this.auth.getAuth();
    if (!snapshot) {
      return Promise.reject(new Error('No Convex token available.'));
    }

    const userId = snapshot.decoded['sub'];
    return fetch(`/api/reports/${String(userId)}`, {
      headers: { Authorization: `Bearer ${snapshot.token}` },
    });
  }
}
