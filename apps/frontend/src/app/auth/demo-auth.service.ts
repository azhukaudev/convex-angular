import { Injectable, signal } from '@angular/core';
import { injectBetterAuth } from 'convex-angular/better-auth';

import { environment } from '../../environments/environment';
import { getDemoAuthClient } from './auth-client';

/**
 * App-level Better Auth flows for the demo: sign-in/up/out on the shared
 * client instance, form error surfacing, and success-URL handling. Session
 * and Convex token state live in `injectBetterAuth()` (from
 * `convex-angular/better-auth`), registered via `provideBetterAuth(...)`.
 */
@Injectable()
export class DemoAuthService {
  private readonly betterAuth = injectBetterAuth();

  readonly formErrorMessage = signal<string | null>(null);

  constructor() {
    if (!environment.convexSiteUrl) {
      this.formErrorMessage.set(
        '[demo auth] Missing NG_APP_CONVEX_SITE_URL. Set it to your Convex .site origin before using the auth demo.',
      );
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    this.formErrorMessage.set(null);

    try {
      const result = await getDemoAuthClient().signIn.email({
        email,
        password,
        callbackURL: this.getSuccessUrl(),
        fetchOptions: { throw: false },
      });

      if (result.error) {
        this.formErrorMessage.set(result.error.message ?? 'Unable to sign in with those credentials.');
        return false;
      }

      await this.betterAuth.refreshSession();
      return this.betterAuth.isAuthenticated();
    } catch (error) {
      this.formErrorMessage.set(this.describeError(error, 'Better Auth sign-in failed'));
      return false;
    }
  }

  async signUp(name: string, email: string, password: string): Promise<boolean> {
    this.formErrorMessage.set(null);

    try {
      const result = await getDemoAuthClient().signUp.email({
        name,
        email,
        password,
        callbackURL: this.getSuccessUrl(),
        fetchOptions: { throw: false },
      });

      if (result.error) {
        this.formErrorMessage.set(result.error.message ?? 'Unable to create that account.');
        return false;
      }

      await this.betterAuth.refreshSession();
      return this.betterAuth.isAuthenticated();
    } catch (error) {
      this.formErrorMessage.set(this.describeError(error, 'Better Auth sign-up failed'));
      return false;
    }
  }

  async signOut(): Promise<void> {
    this.formErrorMessage.set(null);

    try {
      const result = await getDemoAuthClient().signOut({
        fetchOptions: { throw: false },
      });

      if (result.error && !this.isExpectedAuthStatus(result.error.status)) {
        this.formErrorMessage.set(this.describeError(result.error, 'Better Auth sign-out failed'));
      }
    } catch (error) {
      this.formErrorMessage.set(this.describeError(error, 'Better Auth sign-out failed'));
    } finally {
      this.betterAuth.clearSession();
    }
  }

  clearFormError(): void {
    this.formErrorMessage.set(null);
  }

  private getSuccessUrl(): string {
    const baseUrl = environment.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '');

    return baseUrl ? new URL('/auth/success', baseUrl).toString() : '/auth/success';
  }

  private isExpectedAuthStatus(status?: number): boolean {
    return status === 401 || status === 403;
  }

  private describeError(error: unknown, context: string): string {
    if (error instanceof Error) {
      return `[demo auth] ${context}: ${error.message}`;
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return `[demo auth] ${context}: ${error.message}`;
    }

    return `[demo auth] ${context}: ${String(error)}`;
  }
}
