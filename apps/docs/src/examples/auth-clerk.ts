import { Injectable, InjectionToken, Signal, computed, inject } from '@angular/core';
import { ClerkAuthProvider } from 'convex-angular';

/**
 * These docs do not depend on `@clerk/clerk-js`, so the small slice of the
 * Clerk SDK used below is declared locally. In your application these values
 * come from your Clerk instance instead.
 */
interface ClerkSession {
  id: string;
  /** The session token's `aud` claim. */
  audience?: string;
  getToken(options?: { template?: string; skipCache?: boolean }): Promise<string | null>;
}

interface ClerkSdk {
  loaded: Signal<boolean>;
  user: Signal<{ id: string } | null>;
  session: Signal<ClerkSession | null>;
  organization: Signal<{ id: string; membership?: { role: string } } | null>;
}

const CLERK_SDK = new InjectionToken<ClerkSdk>('CLERK_SDK');

@Injectable({ providedIn: 'root' })
export class ClerkAuthService implements ClerkAuthProvider {
  private readonly clerk = inject(CLERK_SDK);

  readonly isLoaded = computed(() => this.clerk.loaded());
  readonly isSignedIn = computed(() => !!this.clerk.user());

  // `sessionId` is what makes a replaced session (sign out, then sign back in)
  // re-run Convex auth setup instead of stranding it on the dead session.
  readonly sessionId = computed(() => this.clerk.session()?.id);
  readonly orgId = computed(() => this.clerk.organization()?.id);
  readonly orgRole = computed(() => this.clerk.organization()?.membership?.role);

  // When this is 'convex', the adapter uses Clerk's native Convex integration
  // and requests no JWT template.
  readonly sessionAudience = computed(() => this.clerk.session()?.audience);

  async getToken(options?: { template?: string; skipCache?: boolean }): Promise<string | null> {
    return (await this.clerk.session()?.getToken(options)) ?? null;
  }
}
