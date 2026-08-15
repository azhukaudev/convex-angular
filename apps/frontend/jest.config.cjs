const { createCjsPreset } = require('jest-preset-angular/presets');

// See packages/convex-angular/jest.config.cjs for why this is `.cjs` and not `.ts`.
/** @type {import('jest').Config} */
module.exports = {
  ...createCjsPreset(),
  displayName: 'frontend',
  // Caps jest-worker children to dodge the Node 24 SIGSEGV; see CLAUDE.md.
  maxWorkers: 4,
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/frontend',
  moduleNameMapper: {
    '^convex-angular/testing$': '<rootDir>/../../packages/convex-angular/testing/src/index.ts',
    '^convex-angular/better-auth$': '<rootDir>/../../packages/convex-angular/better-auth/src/index.ts',
    '^convex-angular$': '<rootDir>/../../packages/convex-angular/src/index.ts',
  },
};
