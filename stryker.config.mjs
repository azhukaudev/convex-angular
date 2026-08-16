// Mutation testing for the publishable library. Run with `pnpm test:mutation`;
// see AGENTS.md for the verification workflow.
//
// Held at 9.x deliberately: 10.0.0 moves the instrumenter to Babel 8, which we are
// not adopting on a toolchain that also has to satisfy jest-preset-angular.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'pnpm',

  // Required under pnpm: Stryker's default `['@stryker-mutator/*']` glob resolves
  // relative to core's real path inside `.pnpm`, where the sibling plugins are not
  // visible, so auto-discovery finds nothing. Listing them is the documented fix.
  plugins: ['@stryker-mutator/jest-runner', '@stryker-mutator/typescript-checker'],

  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'packages/convex-angular/jest.config.cjs',
  },

  // Per-test coverage: only the tests that actually touch a mutant get re-run.
  coverageAnalysis: 'perTest',

  // Skips the option objects Angular requires to be statically analyzable. Inert
  // today; kept so the first signal input added here cannot smuggle in a mutant
  // that no test could ever kill.
  ignorers: ['angular'],

  // ts-jest is transpile-only, so type-invalid mutants would survive and deflate the
  // score. The checker rejects them first, against the library's own typecheck
  // project so all three entry points are covered at the right strictness.
  checkers: ['typescript'],
  tsconfigFile: 'packages/convex-angular/tsconfig.typecheck.json',

  // `testing/` is in scope: MockConvexClient is shipped API, not a test-only shim.
  mutate: [
    'packages/convex-angular/src/lib/**/*.ts',
    'packages/convex-angular/testing/src/**/*.ts',
    'packages/convex-angular/better-auth/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/index.ts', // barrels: re-exports only
    '!packages/convex-angular/src/test-setup.ts',
    '!packages/convex-angular/src/lib/types.ts', // type-only, erased at runtime
  ],

  // Slims the sandbox. Dropping `apps` is safe because the dependency arrow only
  // points one way: the demo app imports the library, never the reverse.
  ignorePatterns: ['apps', 'dist', 'coverage', 'tmp', 'plans', 'docs', '.angular', '.nx', '.verdaccio', '.pnpm-store'],

  concurrency: 4,
  reporters: ['progress', 'clear-text', 'html'],
};
