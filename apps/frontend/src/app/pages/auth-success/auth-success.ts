import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { MockAuthService } from '../../auth/mock-auth.service';

@Component({
  imports: [RouterLink, ButtonModule, CardModule],
  selector: 'cva-auth-success',
  templateUrl: 'auth-success.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class AuthSuccess {
  private readonly router = inject(Router);
  private readonly authService = inject(MockAuthService);

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
