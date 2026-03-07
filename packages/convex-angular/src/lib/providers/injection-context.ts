import {
  EnvironmentInjector,
  assertInInjectionContext,
  inject,
  runInInjectionContext,
} from '@angular/core';

export function resolveEnvironmentInjector(
  target: (...args: any[]) => unknown,
  injectRef?: EnvironmentInjector,
): EnvironmentInjector {
  // An explicit injectRef lets helpers be created later from plain code while
  // still resolving dependencies from the original Angular injector.
  if (injectRef) {
    return injectRef;
  }

  // Without an override we stay in Angular's ambient injection context so
  // component/service-owned lifecycles keep working as they do today.
  assertInInjectionContext(target);
  return inject(EnvironmentInjector);
}

export function runInResolvedInjectionContext<T>(
  target: (...args: any[]) => unknown,
  injectRef: EnvironmentInjector | undefined,
  fn: () => T,
): T {
  // Re-enter the provided injector when callers explicitly want this helper to
  // bind its effects, DestroyRef, and injections to that scope.
  if (injectRef) {
    return runInInjectionContext(injectRef, fn);
  }

  // Ambient calls should continue to execute in the current context so
  // ownership stays with the caller's existing Angular scope.
  assertInInjectionContext(target);
  return fn();
}
