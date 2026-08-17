import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // Astro's generated type declarations and the build output are not
    // first-party source. Globs are prefixed with `**/` because the lint
    // target runs from the workspace root, not from this directory.
    // `.vercel/output` is the adapter's minified build output; ESLint does not
    // read .gitignore, so it needs ignoring here as well as there.
    ignores: ['**/.astro/**', '**/dist/**', '**/.vercel/**'],
  },
  ...baseConfig,
];
