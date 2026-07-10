import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { DemoAuthService } from '../../auth/demo-auth.service';
import { Message } from '../shared/message/message';

type AuthMode = 'sign-in' | 'sign-up';

@Component({
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    Message,
  ],
  selector: 'cva-auth-login',
  templateUrl: 'auth-login.html',
  styleUrl: 'auth-login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export default class AuthLogin {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly authService = inject(DemoAuthService);
  readonly mode = signal<AuthMode>('sign-in');
  readonly hidePassword = signal(true);

  readonly authForm = this.fb.group({
    name: ['', [Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly submitLabel = computed(() => (this.mode() === 'sign-up' ? 'Create Account' : 'Sign In'));

  constructor() {
    effect(() => {
      const nameControl = this.authForm.controls.name;
      const isSignUp = this.mode() === 'sign-up';

      if (isSignUp) {
        nameControl.setValidators([Validators.required, Validators.minLength(2)]);
      } else {
        nameControl.setValidators([Validators.minLength(2)]);
      }

      nameControl.updateValueAndValidity({ emitEvent: false });
      this.authService.clearFormError();
    });
  }

  setMode(mode: AuthMode): void {
    if (this.mode() === mode) {
      return;
    }

    this.mode.set(mode);
  }

  onTabChange(index: number): void {
    this.setMode(index === 1 ? 'sign-up' : 'sign-in');
  }

  async onSubmit(): Promise<void> {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    const { email, name, password } = this.authForm.getRawValue();
    const success =
      this.mode() === 'sign-up'
        ? await this.authService.signUp(name, email, password)
        : await this.authService.signIn(email, password);

    if (success) {
      await this.router.navigateByUrl(this.getSuccessUrl());
    }
  }

  private getSuccessUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return '/auth/success';
    }

    return returnUrl;
  }
}
