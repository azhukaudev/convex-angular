// Run with `node --test '.github/scripts/*.test.mjs'` from the repository root: `decide()`
// checks which files exist relative to the working directory.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decide, isUsableBase, parseMutatePatterns } from './ci-changes.mjs';

const LIB = 'packages/convex-angular/';
const QUERY = `${LIB}src/lib/providers/inject-query.ts`;

test('a library source change mutates that file only', () => {
  assert.deepEqual(decide([QUERY]), { library: true, mutate: QUERY });
});

test('a spec mutates the source it tests, including a dotted spec name', () => {
  assert.deepEqual(decide([`${LIB}src/lib/providers/inject-query.ssr.spec.ts`]), { library: true, mutate: QUERY });
});

// Depends on `src/lib/internal/convex-internals.ts` NOT existing: only `convex-client-internals.ts`
// does. If a source of that name is ever added, pick another spec that has no same-named source.
test('a spec with no same-named source runs everything', () => {
  assert.equal(decide([`${LIB}src/lib/internal/convex-internals.spec.ts`]).mutate, 'full');
});

test('barrels and files Stryker excludes are not mutated', () => {
  assert.equal(decide([`${LIB}src/lib/providers/index.ts`]).mutate, 'none');
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

test("parseMutatePatterns understands the config's pattern shapes and rejects others", () => {
  const parsed = parseMutatePatterns(['a/b/**/*.ts', '!**/*.spec.ts', '!**/index.ts', '!a/b/c.ts']);
  assert.deepEqual(parsed.roots, ['a/b/']);
  assert.deepEqual(parsed.excludedSuffixes, ['.spec.ts']);
  assert.deepEqual([...parsed.excludedNames], ['index.ts']);
  assert.deepEqual([...parsed.excludedFiles], ['a/b/c.ts']);
  assert.throws(() => parseMutatePatterns(['a/**/{x,y}.ts']), /Unsupported/);
});

test('isUsableBase rejects an empty, all-zeros, unknown or unrelated base', () => {
  const calls = [];
  const hasMergeBase = (args) => {
    calls.push(args);
  };
  const noMergeBase = () => {
    throw new Error('exit 1'); // `git merge-base` fails for an unknown commit or unrelated histories
  };
  assert.equal(isUsableBase('', hasMergeBase), false);
  assert.equal(isUsableBase(undefined, hasMergeBase), false);
  assert.equal(isUsableBase('0000000000000000000000000000000000000000', hasMergeBase), false);
  assert.deepEqual(calls, []); // an unusable value is rejected before git is asked
  assert.equal(isUsableBase('abc123', noMergeBase), false);
  assert.equal(isUsableBase('abc123', hasMergeBase), true);
  assert.deepEqual(calls, [['merge-base', 'abc123', 'HEAD']]);
});
