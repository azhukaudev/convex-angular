import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { injectPrewarmQuery } from 'convex-angular';

import { api } from './convex/api';

@Component({
  selector: 'app-user-list',
  imports: [RouterLink],
  template: `
    @for (id of userIds; track id) {
      <a [routerLink]="['/users', id]" (mouseenter)="onIntent(id)" (focus)="onIntent(id)">{{ id }}</a>
      <button type="button" (click)="openWhenWarm(id)">Open {{ id }} when ready</button>
    }
  `,
})
export class UserListComponent {
  private readonly router = inject(Router);

  readonly userIds = ['user-1', 'user-2'];

  readonly prewarmProfile = injectPrewarmQuery(api.users.getProfile, {
    // Hold the warm subscription long enough to cover an unhurried click.
    extendSubscriptionFor: 10_000,
    onError: (error, args) => console.warn('prewarm failed for', args.userId, error),
  });

  // Fire-and-forget on intent: the promise is not interesting here. The
  // `routerLink` navigates on click by itself; this only warms the cache.
  onIntent(userId: string): void {
    void this.prewarmProfile.prewarm({ userId });
  }

  // Or await it to hold navigation until the cache is warm. That only works on
  // an element that does not navigate by itself, like this button: `routerLink`
  // navigates on every click, whatever another (click) handler does. `prewarm()`
  // resolves false on failure, expiry, or scope destruction — navigate either
  // way and let the routed component's own query handle it.
  async openWhenWarm(userId: string): Promise<void> {
    await this.prewarmProfile.prewarm({ userId });
    await this.router.navigate(['/users', userId]);
  }
}
