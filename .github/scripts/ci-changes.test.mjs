// Run with `node --test '.github/scripts/*.test.mjs'` from the repository root: `decide()`
// checks which files exist relative to the working directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide } from './ci-changes.mjs';

const LIB = 'packages/convex-angular/';
const QUERY = `${LIB}src/lib/providers/inject-query.ts`;

test('a library source change mutates that file only', () => {
  assert.deepEqual(decide([QUERY]), { library: true, mutate: QUERY });
});

test('the testing and better-auth entry points are mutated like the main one', () => {
  for (const file of [`${LIB}testing/src/mock-convex-client.ts`, `${LIB}better-auth/src/better-auth.service.ts`]) {
    assert.deepEqual(decide([file]), { library: true, mutate: file });
  }
});

test('a spec mutates the source it tests, including a dotted spec name', () => {
  assert.deepEqual(decide([`${LIB}src/lib/providers/inject-query.ssr.spec.ts`]), { library: true, mutate: QUERY });
});

test('a spec with no same-named source runs everything', () => {
  const tree = new Set([`${LIB}src/lib/internal/convex-client-internals.ts`]);
  assert.equal(decide([`${LIB}src/lib/internal/convex-internals.spec.ts`], (file) => tree.has(file)).mutate, 'full');
});

test('a spec mutates its source only when that source exists', () => {
  const spec = `${LIB}src/lib/providers/inject-thing.spec.ts`;
  const source = `${LIB}src/lib/providers/inject-thing.ts`;
  assert.deepEqual(
    decide([spec], (file) => file === source),
    { library: true, mutate: source },
  );
  assert.equal(decide([spec], () => false).mutate, 'full');
});

test('barrels and files Stryker excludes are not mutated', () => {
  assert.equal(decide([`${LIB}testing/src/index.ts`]).mutate, 'none');
  assert.equal(decide([`${LIB}src/lib/types.ts`]).mutate, 'full');
});

test('shared configuration runs everything', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'stryker.config.mjs',
    '.github/scripts/ci-changes.mjs',
    `${LIB}jest.config.cjs`,
  ]) {
    assert.deepEqual(decide([file]), { library: true, mutate: 'full' }, file);
  }
  assert.equal(decide([`${LIB}tsconfig.typecheck.json`]).mutate, 'full');
});

test('ci.yml alone checks the peer range but does not trigger mutation', () => {
  assert.deepEqual(decide(['.github/workflows/ci.yml']), { library: true, mutate: 'none' });
});

test('changes outside the library need neither job', () => {
  assert.deepEqual(decide(['apps/docs/src/content/docs/index.mdx', 'README.md']), { library: false, mutate: 'none' });
});

test('a deleted source file leaves nothing to mutate', () => {
  assert.deepEqual(decide([`${LIB}src/lib/providers/deleted-long-ago.ts`]), { library: true, mutate: 'none' });
});

// The CLI is what CI runs. A base it cannot diff against must fall back to the full answer
// rather than an empty or partial one.
test('a base that cannot be diffed gets the full answer', () => {
  const script = fileURLToPath(new URL('./ci-changes.mjs', import.meta.url));
  const env = { ...process.env };
  delete env.GITHUB_OUTPUT;
  const bases = [[], [''], ['0000000000000000000000000000000000000000'], ['not-a-commit-0123456789abcdef']];
  for (const args of bases) {
    const stdout = execFileSync('node', [script, ...args], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(stdout, 'library=true\nmutate=full\n', JSON.stringify(args));
  }
});
