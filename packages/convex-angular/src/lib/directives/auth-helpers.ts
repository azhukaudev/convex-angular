import {
  Directive,
  EmbeddedViewRef,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
} from '@angular/core';

import { injectAuth } from '../providers/inject-auth';

/**
 * Structural directive that renders content only when authenticated.
 *
 * This directive will show its content when:
 * - The auth provider reports the user as authenticated
 * - Convex has confirmed the authentication token
 * - Auth is not in a loading state
 *
 * @example
 * ```html
 * <div *cvaAuthenticated>
 *   Welcome back! Your dashboard content here.
 * </div>
 * ```
 *
 * @example
 * ```html
 * <nav *cvaAuthenticated>
 *   <span>Hello, {{ user.name() }}</span>
 *   <button (click)="logout()">Sign Out</button>
 * </nav>
 * ```
 *
 * @public
 */
@Directive({
  selector: '[cvaAuthenticated]',
  standalone: true,
})
export class CvaAuthenticatedDirective {
  private readonly templateRef = inject(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = injectAuth();
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const isAuth = this.auth.isAuthenticated();
      const isLoading = this.auth.isLoading();

      if (isAuth && !isLoading) {
        if (!this.viewRef) {
          this.viewRef = this.viewContainer.createEmbeddedView(
            this.templateRef,
          );
        }
      } else {
        if (this.viewRef) {
          this.viewContainer.clear();
          this.viewRef = null;
        }
      }
    });
  }
}

/**
 * Structural directive that renders content only when NOT authenticated.
 *
 * This directive will show its content when:
 * - The user is not authenticated
 * - Auth is not in a loading state
 *
 * @example
 * ```html
 * <div *cvaUnauthenticated>
 *   Please sign in to continue.
 *   <button (click)="login()">Sign In</button>
 * </div>
 * ```
 *
 * @example
 * ```html
 * <section *cvaUnauthenticated>
 *   <h1>Welcome to Our App</h1>
 *   <p>Sign in to access your account.</p>
 *   <app-login-form />
 * </section>
 * ```
 *
 * @public
 */
@Directive({
  selector: '[cvaUnauthenticated]',
  standalone: true,
})
export class CvaUnauthenticatedDirective {
  private readonly templateRef = inject(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = injectAuth();
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const isAuth = this.auth.isAuthenticated();
      const isLoading = this.auth.isLoading();

      if (!isAuth && !isLoading) {
        if (!this.viewRef) {
          this.viewRef = this.viewContainer.createEmbeddedView(
            this.templateRef,
          );
        }
      } else {
        if (this.viewRef) {
          this.viewContainer.clear();
          this.viewRef = null;
        }
      }
    });
  }
}

/**
 * Structural directive that renders content while auth is loading.
 *
 * This directive will show its content when:
 * - The auth provider is still loading
 * - OR Convex is waiting for token confirmation
 *
 * @example
 * ```html
 * <div *cvaAuthLoading>
 *   <p-progressSpinner />
 *   <span>Checking authentication...</span>
 * </div>
 * ```
 *
 * @example
 * ```html
 * <app-skeleton-layout *cvaAuthLoading />
 * ```
 *
 * @public
 */
@Directive({
  selector: '[cvaAuthLoading]',
  standalone: true,
})
export class CvaAuthLoadingDirective {
  private readonly templateRef = inject(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = injectAuth();
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const isLoading = this.auth.isLoading();

      if (isLoading) {
        if (!this.viewRef) {
          this.viewRef = this.viewContainer.createEmbeddedView(
            this.templateRef,
          );
        }
      } else {
        if (this.viewRef) {
          this.viewContainer.clear();
          this.viewRef = null;
        }
      }
    });
  }
}
