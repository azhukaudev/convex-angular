import type { KnipConfig } from 'knip';

// Nx integrated monorepo: one root package.json, projects defined by
// project.json files, so all entry points are declared here explicitly.
const config: KnipConfig = {
  entry: [
    // Demo app (bootstrap, test harness, builder-injected pieces)
    'apps/frontend/src/main.ts',
    'apps/frontend/src/test-setup.ts',
    'apps/frontend/src/types.d.ts',
    'apps/frontend/src/styles.scss',
    // Swapped in via the production fileReplacements in project.json
    'apps/frontend/src/environments/environment.prod.ts',
    // Wired into the esbuild builder via project.json plugins option
    'apps/frontend/plugins/env-var-plugin.js',
    // Convex backend functions are invoked by the Convex runtime
    'apps/frontend/src/convex/*.ts',
    // Published library public API and test harness
    'packages/convex-angular/src/index.ts',
    'packages/convex-angular/src/test-setup.ts',
    // Secondary entry point: convex-angular/testing
    'packages/convex-angular/testing/src/index.ts',
    // Secondary entry point: convex-angular/better-auth
    'packages/convex-angular/better-auth/src/index.ts',
    // Specs are entries (discovered by Jest, not imported)
    '{apps,packages}/**/*.spec.ts',
    // Tooling configs
    'jest.preset.js',
    '{apps,packages}/*/jest.config.ts',
    '{apps,packages}/*/vitest.config.mts',
    '{apps,packages}/*/eslint.config.mjs',
  ],
  project: ['{apps,packages}/**/*.{ts,js,mjs}', '*.{ts,js,mjs}'],
  ignore: [
    // Convex codegen output
    'apps/frontend/src/convex/_generated/**',
  ],
  // Dynamic route-component imports inside TSDoc @example blocks (auth-guards.ts).
  // Kept as literals so a real broken dynamic import still surfaces; add the
  // path here when a new doc example references another component.
  ignoreUnresolved: [
    './dashboard/dashboard.component',
    './profile/profile.component',
    './admin/admin.component',
    './login/login.component',
  ],
  ignoreDependencies: [
    // Fonts loaded via the project.json styles array, never imported from code
    '@fontsource/roboto',
    'material-symbols',
    // Toolchain required by Nx Angular executors and `nx migrate`; never imported
    '@angular/cli',
    '@nx/workspace',
    // Resolved at runtime by the @nx/vitest executor / vitest config, never imported
    '@nx/vitest',
    // IDE Angular template support; never imported
    '@angular/language-service',
    // Loads TS configs (jest.config.ts) at runtime for Nx/Jest
    'ts-node',
    // Transformer underneath jest-preset-angular (peer dependency)
    'ts-jest',
    // TEMPORARY (jest→vitest migration): last import removed with the frontend's
    // jest test-setup; the package itself is deleted in the dependency-removal task
    'jest-preset-angular',
    // TEMPORARY (jest→vitest migration): was only consumed via jest-preset-angular's
    // zone setup; deleted in the dependency-removal task
    '@angular/platform-browser-dynamic',
    // Emitted as runtime helper imports by @analogjs/vite-plugin-angular's
    // es2016 downleveling (oxc); never imported from source
    '@oxc-project/runtime',
    // Flat-config ESLint toolchain: pulled transitively by @nx/eslint-plugin
    // presets and referenced only as rule-name strings; versions are managed
    // by `nx migrate` and must stay installed for the presets to resolve
    '@eslint/js',
    'angular-eslint',
    'typescript-eslint',
    '@typescript-eslint/utils',
  ],
};

export default config;
