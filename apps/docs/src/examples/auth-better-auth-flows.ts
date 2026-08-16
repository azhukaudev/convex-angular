import { Component, Injectable, inject, signal } from '@angular/core';
import { BetterAuthClientLike, injectBetterAuth } from 'convex-angular/better-auth';

/**
 * Your real client exposes the sign-in/up/out flows on top of the structural
 * surface convex-angular needs. Declared here because these docs do not depend
 * on `better-auth`; in your app this is `import { authClient } from './auth-client'`.
 */
type AppAuthClient = BetterAuthClientLike & {
  signIn: {
    email(input: {
      email: string;
      password: string;
      fetchOptions?: { throw?: boolean };
    }): Promise<{ error: { message?: string; status?: number } | null }>;
  };
  signOut(input?: {
    fetchOptions?: { throw?: boolean };
  }): Promise<{ error: { message?: string; status?: number } | null }>;
};

declare const authClient: AppAuthClient;

@Injectable({ providedIn: 'root' })
export class AuthFlowsService {
  // Session and Convex token state live in the library; the flows stay on your
  // own client instance.
  private readonly betterAuth = injectBetterAuth();

  readonly formError = signal<string | null>(null);

  async signIn(email: string, password: string): Promise<boolean> {
    this.formError.set(null);

    const result = await authClient.signIn.email({ email, password, fetchOptions: { throw: false } });
    if (result.error) {
      this.formError.set(result.error.message ?? 'Unable to sign in with those credentials.');
      return false;
    }

    // Re-sync the session so Convex picks up the new token.
    await this.betterAuth.refreshSession();
    return this.betterAuth.isAuthenticated();
  }

  async signOut(): Promise<void> {
    try {
      await authClient.signOut({ fetchOptions: { throw: false } });
    } finally {
      // Local bookkeeping: drops the session snapshot and the token cache.
      this.betterAuth.clearSession();
    }
  }
}

@Component({
  selector: 'app-session-banner',
  template: `
    @if (betterAuth.isLoading()) {
      <p>Loading session…</p>
    } @else if (betterAuth.session(); as session) {
      <p>Signed in as {{ session.user.id }}</p>
      <button type="button" (click)="flows.signOut()">Sign out</button>
    } @else {
      <p>Signed out.</p>
    }

    @if (betterAuth.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    }
  `,
})
export class SessionBannerComponent {
  readonly betterAuth = injectBetterAuth();
  readonly flows = inject(AuthFlowsService);
}
