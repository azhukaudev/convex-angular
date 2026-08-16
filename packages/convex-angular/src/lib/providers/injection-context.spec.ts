import {
  EnvironmentInjector,
  InjectionToken,
  createEnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { resolveEnvironmentInjector, runInResolvedInjectionContext } from './injection-context';

const TEST_TOKEN = new InjectionToken<string>('TEST_TOKEN');

function testTarget() {
  return undefined;
}

function captureThrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}

function expectGuidedContextError(error: Error): void {
  expect(error).toBeInstanceOf(Error);
  // The diagnostic names the offending helper and both ways to fix the call.
  expect(error.message).toMatch(/^testTarget\(\) must be called from an injection context/);
  expect(error.message).toMatch(/explicit injector/);
  expect(error.message).toMatch(/`injectRef` option/);
}

describe('injection-context helpers', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: TEST_TOKEN, useValue: 'root' }],
    });
  });

  it('returns the explicit injector outside an injection context', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    expect(resolveEnvironmentInjector(testTarget, injector)).toBe(injector);
  });

  it('returns the ambient injector when called in an injection context', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const resolved = runInInjectionContext(injector, () => resolveEnvironmentInjector(testTarget));

    expect(resolved).toBe(injector);
  });

  it('throws a guided error when resolving outside an injection context', () => {
    expectGuidedContextError(captureThrown(() => resolveEnvironmentInjector(testTarget)));
  });

  it('runs inside the provided injector outside an injection context', () => {
    const rootInjector = TestBed.inject(EnvironmentInjector);
    const childInjector = createEnvironmentInjector([{ provide: TEST_TOKEN, useValue: 'child' }], rootInjector);

    const value = runInResolvedInjectionContext(testTarget, childInjector, () => inject(TEST_TOKEN));

    expect(value).toBe('child');

    childInjector.destroy();
  });

  it('uses the ambient injector when no explicit injector is provided', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    const value = runInInjectionContext(injector, () =>
      runInResolvedInjectionContext(testTarget, undefined, () => inject(TEST_TOKEN)),
    );

    expect(value).toBe('root');
  });

  it('prefers the explicit injector over the ambient injector', () => {
    const rootInjector = TestBed.inject(EnvironmentInjector);
    const childInjector = createEnvironmentInjector([{ provide: TEST_TOKEN, useValue: 'child' }], rootInjector);

    const value = runInInjectionContext(rootInjector, () =>
      runInResolvedInjectionContext(testTarget, childInjector, () => inject(TEST_TOKEN)),
    );

    expect(value).toBe('child');

    childInjector.destroy();
  });

  it('throws a guided error when running outside an injection context', () => {
    expectGuidedContextError(captureThrown(() => runInResolvedInjectionContext(testTarget, undefined, () => 'ok')));
  });
});
