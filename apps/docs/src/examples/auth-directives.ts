import { Component } from '@angular/core';
import {
  CvaAuthLoadingDirective,
  CvaAuthRefreshingDirective,
  CvaAuthenticatedDirective,
  CvaUnauthenticatedDirective,
} from 'convex-angular';

@Component({
  selector: 'app-shell',
  imports: [
    CvaAuthenticatedDirective,
    CvaUnauthenticatedDirective,
    CvaAuthLoadingDirective,
    CvaAuthRefreshingDirective,
  ],
  template: `
    <p *cvaAuthLoading>Checking your session…</p>

    <!-- Stays mounted while the session is refreshing. -->
    <section *cvaAuthenticated>
      <h1>Dashboard</h1>
    </section>

    <!-- Layered on top of the still-mounted authenticated content. -->
    <div *cvaAuthRefreshing role="status" class="banner">Reconnecting your session…</div>

    <section *cvaUnauthenticated>
      <h1>Welcome</h1>
      <a href="/login">Sign in</a>
    </section>
  `,
})
export class ShellComponent {}
