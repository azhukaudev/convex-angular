/// <reference types="vitest" />
import { resolve } from 'node:path';

import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/convex-angular',
  plugins: [angular()],
  ssr: {
    // Inline Angular fesm2022 bundles so @analogjs/vite-plugin-angular's vitest
    // plugin downlevels their native async/await to es2016 — zone.js cannot
    // patch native await, and without this Router navigation stalls forever
    // under fakeAsync. The plugin itself only inlines */testing bundles.
    noExternal: [/fesm2022/],
  },
  resolve: {
    alias: [
      // Order matters: specific subpaths must precede the bare package name (prefix matching).
      {
        find: 'convex-angular/testing',
        replacement: resolve(import.meta.dirname, 'testing/src/index.ts'),
      },
      {
        find: 'convex-angular/better-auth',
        replacement: resolve(import.meta.dirname, 'better-auth/src/index.ts'),
      },
      {
        find: 'convex-angular',
        replacement: resolve(import.meta.dirname, 'src/index.ts'),
      },
    ],
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'testing/src/**/*.spec.ts', 'better-auth/src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: '../../coverage/packages/convex-angular',
    },
  },
}));
