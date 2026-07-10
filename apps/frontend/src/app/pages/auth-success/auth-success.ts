import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { CvaAuthRefreshingDirective, injectAuth, injectQuery } from 'convex-angular';

import { api } from '../../../convex/_generated/api';
import { DemoAuthService } from '../../auth/demo-auth.service';

@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CvaAuthRefreshingDirective,
  ],
  selector: 'cva-auth-success',
  templateUrl: 'auth-success.html',
  styleUrl: 'auth-success.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
