/// <reference types="vitest" />
import { resolve } from 'node:path';

import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/frontend',
  plugins: [angular()],
  // Same amendment as the library config: downlevel @angular/* fesm2022 bundles
  // so zone.js fakeAsync can intercept their async/await (Router stalls without it).
  ssr: { noExternal: [/fesm2022/] },
  resolve: {
    alias: [
      {
        find: 'convex-angular/testing',
        replacement: resolve(import.meta.dirname, '../../packages/convex-angular/testing/src/index.ts'),
      },
      {
        find: 'convex-angular/better-auth',
        replacement: resolve(import.meta.dirname, '../../packages/convex-angular/better-auth/src/index.ts'),
      },
      {
        find: 'convex-angular',
        replacement: resolve(import.meta.dirname, '../../packages/convex-angular/src/index.ts'),
      },
    ],
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: '../../coverage/apps/frontend',
    },
  },
}));
