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

  it('throws outside an injection context when no injector is provided', () => {
    expect(() => resolveEnvironmentInjector(testTarget)).toThrow();
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

  it('throws outside an injection context when no injector is provided', () => {
    expect(() => runInResolvedInjectionContext(testTarget, undefined, () => 'ok')).toThrow();
  });
});
