import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { injectAuth, injectQuery } from 'convex-angular';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { api } from '../../../convex/_generated/api';
import { DemoAuthService } from '../../auth/demo-auth.service';

@Component({
  imports: [RouterLink, ButtonModule, CardModule, ProgressSpinnerModule],
  selector: 'cva-auth-success',
  templateUrl: 'auth-success.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class AuthSuccess {
  private readonly router = inject(Router);
  readonly auth = injectAuth();
  readonly authService = inject(DemoAuthService);
  readonly currentUser = injectQuery(api.auth.getCurrentUser, () => ({}));

  async onLogout(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigate(['/auth/login']);
  }
}
