import type { KnipConfig } from 'knip';

// Two pnpm workspaces: the repository root (an Nx integrated monorepo whose
// projects are defined by project.json files, so its entry points are declared
// explicitly) and apps/docs (a real package with its own manifest). Once any
// `workspaces` key is used, knip stops reading top-level `entry`/`project`, so
// the root configuration lives under the '.' key rather than at the top level.
const config: KnipConfig = {
  workspaces: {
    '.': {
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
        '{apps,packages}/*/jest.config.cjs',
        '{apps,packages}/*/eslint.config.mjs',
        // stryker.config.mjs needs no entry: knip's built-in Stryker plugin claims it
        // and resolves the runner/checker plugins named inside it.
      ],
      // apps/docs is excluded here; it is its own workspace below.
      project: ['apps/frontend/**/*.{ts,js,mjs}', 'packages/convex-angular/**/*.{ts,js,mjs}', '*.{ts,js,mjs}'],
      ignore: [
        // Convex codegen output
        'apps/frontend/src/convex/_generated/**',
      ],
    },
    // knip's first-class Astro and Starlight plugins claim astro.config.mjs,
    // content.config.ts, and the content collection pages automatically
    // because apps/docs/package.json declares astro and @astrojs/starlight.
    'apps/docs': {
      // Compiled documentation samples are rendered into MDX through Vite
      // `?raw` imports, which knip does not follow, and are type-checked by
      // tsconfig.examples.json. They are roots, not dead code.
      entry: ['src/examples/**/*.ts', 'scripts/*.mjs'],
      project: ['src/**/*.{astro,ts,js,mjs,mdx}', 'scripts/*.mjs', '*.{ts,js,mjs}'],
      ignoreDependencies: [
        // Examples import the published specifier so they read like consumer
        // code, but it resolves through the tsconfig.base.json path aliases to
        // library source. Nothing here is executed, so there is no runtime
        // dependency to declare.
        'convex-angular',
      ],
    },
  },
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
    // IDE Angular template support; never imported
    '@angular/language-service',
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
