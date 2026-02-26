import {
  Directive,
  EmbeddedViewRef,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
} from '@angular/core';

import { injectAuth } from '../providers/inject-auth';
import { ConvexAuthState } from '../tokens/auth';

/**
 * Set up a reactive view that conditionally renders based on auth state.
 *
 * This helper encapsulates the shared pattern used by all auth directives:
 * inject TemplateRef + ViewContainerRef + auth, then use an effect to
 * conditionally create or destroy the embedded view.
 *
 * @param conditionFn - A function that receives the auth state and returns
 *   whether the view should be rendered.
 *
 * @internal
 */
function setupAuthView(conditionFn: (auth: ConvexAuthState) => boolean): void {
  const templateRef = inject(TemplateRef);
  const viewContainer = inject(ViewContainerRef);
  const auth = injectAuth();
  let viewRef: EmbeddedViewRef<unknown> | null = null;

  effect(() => {
    if (conditionFn(auth)) {
      if (!viewRef) {
        viewRef = viewContainer.createEmbeddedView(templateRef);
      }
    } else {
      if (viewRef) {
        viewContainer.clear();
        viewRef = null;
      }
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
    setupAuthView((auth) => auth.isAuthenticated() && !auth.isLoading());
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
    setupAuthView((auth) => !auth.isAuthenticated() && !auth.isLoading());
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
    setupAuthView((auth) => auth.isLoading());
  }
}
