import { EnvironmentInjector, assertInInjectionContext, runInInjectionContext } from '@angular/core';

// Like assertInInjectionContext, but the error mentions the library's
// injectRef escape hatch alongside Angular's standard guidance.
function assertHelperInjectionContext(target: (...args: never[]) => unknown): void {
  try {
    assertInInjectionContext(target);
  } catch {
    throw new Error(
      `${target.name}() must be called from an injection context (for example, a component ` +
        'or service field initializer or constructor), or be given an explicit injector via ' +
        'the `injectRef` option to create it later from plain code.',
    );
  }
}

export function runInResolvedInjectionContext<T>(
  target: (...args: never[]) => unknown,
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
  assertHelperInjectionContext(target);
  return fn();
}
