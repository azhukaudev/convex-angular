import { Directive, EmbeddedViewRef, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';

import { injectAuth } from '../providers/inject-auth';

function createAuthVisibilityEffect(shouldRender: (auth: ReturnType<typeof injectAuth>) => boolean): void {
  const templateRef = inject(TemplateRef);
  const viewContainer = inject(ViewContainerRef);
  const auth = injectAuth();
  let viewRef: EmbeddedViewRef<unknown> | null = null;

  effect(() => {
    if (shouldRender(auth)) {
      if (!viewRef) {
        viewRef = viewContainer.createEmbeddedView(templateRef);
      }
      return;
    }

    if (viewRef) {
      viewContainer.clear();
      viewRef = null;
    }
  });
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
export class CvaAuthenticatedDirective {
  constructor() {
    createAuthVisibilityEffect((auth) => auth.isAuthenticated() && !auth.isLoading());
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
  constructor() {
    createAuthVisibilityEffect((auth) => !auth.isAuthenticated() && !auth.isLoading());
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
  constructor() {
    createAuthVisibilityEffect((auth) => auth.isLoading());
  }
}
