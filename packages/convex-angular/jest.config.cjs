const { createCjsPreset } = require('jest-preset-angular/presets');

// Deliberately `.cjs`: `jest-preset-angular/presets` re-exports via
// `module.exports = require(...)`, which Node's CJS lexer cannot analyze for named
// exports, so a `.ts` config fails to load under the bare `jest` that Nx runs.
/** @type {import('jest').Config} */
module.exports = {
  ...createCjsPreset(),
  displayName: 'convex-angular',
  // Caps jest-worker children to dodge the Node 24 SIGSEGV; see CLAUDE.md for the
  // measured rates. Costs no speed — worker startup dominates these small suites.
  maxWorkers: 4,
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/packages/convex-angular',
  moduleNameMapper: {
    '^convex-angular/testing$': '<rootDir>/testing/src/index.ts',
    '^convex-angular/better-auth$': '<rootDir>/better-auth/src/index.ts',
    '^convex-angular$': '<rootDir>/src/index.ts',
  },
};
