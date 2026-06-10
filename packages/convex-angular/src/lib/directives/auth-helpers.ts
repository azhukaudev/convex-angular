import { Directive, EmbeddedViewRef, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';

import { injectAuth } from '../providers/inject-auth';

/**
 * Base for the auth structural directives: renders the attached template
 * while `shouldRender()` is true, clears it otherwise. Subclasses only
 * define the auth-state predicate.
 *
 * @internal
 */
@Directive()
abstract class CvaAuthViewDirective {
  private readonly templateRef = inject(TemplateRef);
  private readonly viewContainer = inject(ViewContainerRef);
  protected readonly auth = injectAuth();
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  protected abstract shouldRender(): boolean;

  constructor() {
    effect(() => {
      if (this.shouldRender()) {
        this.viewRef ??= this.viewContainer.createEmbeddedView(this.templateRef);
      } else if (this.viewRef) {
        this.viewContainer.clear();
        this.viewRef = null;
      }
    });
  }
}

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
export class CvaAuthenticatedDirective extends CvaAuthViewDirective {
  protected shouldRender(): boolean {
    return this.auth.isAuthenticated() && !this.auth.isLoading();
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
export class CvaUnauthenticatedDirective extends CvaAuthViewDirective {
  protected shouldRender(): boolean {
    return !this.auth.isAuthenticated() && !this.auth.isLoading();
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
export class CvaAuthLoadingDirective extends CvaAuthViewDirective {
  protected shouldRender(): boolean {
    return this.auth.isLoading();
  }
}

/**
 * Structural directive that renders content while Convex is refreshing auth.
 *
 * This directive will show its content when the server rejected a
 * previously-confirmed token and Convex paused the socket to fetch a
 * replacement. The user remains authenticated throughout, so `*cvaAuthenticated`
 * content stays mounted; use this directive to layer a "reconnecting" affordance
 * on top. Routine background token rotation does not trigger it.
 *
 * @example
 * ```html
 * <div *cvaAuthRefreshing class="banner">
 *   Reconnecting your session…
 * </div>
 * ```
 *
 * @public
 */
@Directive({
  selector: '[cvaAuthRefreshing]',
  standalone: true,
})
export class CvaAuthRefreshingDirective extends CvaAuthViewDirective {
  protected shouldRender(): boolean {
    return this.auth.isRefreshing();
  }
}
