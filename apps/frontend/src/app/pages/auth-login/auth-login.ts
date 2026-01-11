import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { MockAuthService } from '../../auth/mock-auth.service';

@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
  ],
  selector: 'cva-auth-login',
  templateUrl: 'auth-login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class AuthLogin {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly authService = inject(MockAuthService);

  readonly loginForm = this.fb.group({
    username: ['admin', Validators.required],
    password: ['admin', Validators.required],
  });

  onSubmit(): void {
    const { username, password } = this.loginForm.getRawValue();
    const success = this.authService.login(username, password);
    if (success) {
      this.router.navigate(['/auth/success']);
    }
  }
}
