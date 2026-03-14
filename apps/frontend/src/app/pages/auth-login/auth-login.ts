import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TabsModule } from 'primeng/tabs';

import { DemoAuthService } from '../../auth/demo-auth.service';

type AuthMode = 'sign-in' | 'sign-up';

@Component({
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    TabsModule,
  ],
  selector: 'cva-auth-login',
  templateUrl: 'auth-login.html',
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

  onTabChange(value: string | number | undefined): void {
    if (this.isAuthMode(value)) {
      this.setMode(value);
    }
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

  private isAuthMode(value: unknown): value is AuthMode {
    return value === 'sign-in' || value === 'sign-up';
  }

  private getSuccessUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return '/auth/success';
    }

    return returnUrl;
  }
}
