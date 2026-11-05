import nx from '@nx/eslint-plugin';

import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'cva',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'cva',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    files: ['**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.typecheck.json', 'tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { '@typescript-eslint/no-deprecated': 'error' },
  },
  {
    // Only src/lib/internal/convex-client-internals.ts may reach into the BaseConvexClient that
    // `ConvexClient.client` exposes: that one seam is pinned against a real client by
    // internal/convex-internals.spec.ts, so a convex bump that moves this surface fails once, loudly,
    // instead of silently at N call sites. Specs keep `jest.spyOn(convex.client, …)` as the documented
    // escape hatch; testing/ and better-auth/ have their own (unrelated) `client` members.
    // Patterns are `**/`-prefixed because Nx runs ESLint from the workspace root.
    files: ['**/src/lib/**/*.ts'],
    ignores: ['**/src/lib/internal/**', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='BaseConvexClient']:not(ImportSpecifier > Identifier.local)",
          message:
            'BaseConvexClient may only be used in src/lib/internal/convex-client-internals.ts. Add a wrapper there instead.',
        },
        {
          selector: "MemberExpression[computed=false][property.name='client']",
          message:
            'Do not read ConvexClient.client (the BaseConvexClient) outside src/lib/internal/convex-client-internals.ts. Add a wrapper there instead.',
        },
        {
          selector: "MemberExpression[computed=true][property.value='client']",
          message:
            'Do not read ConvexClient.client (the BaseConvexClient) outside src/lib/internal/convex-client-internals.ts. Add a wrapper there instead.',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
