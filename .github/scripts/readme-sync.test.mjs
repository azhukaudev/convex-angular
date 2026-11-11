// GitHub shows the root README.md and LICENSE, npm ships the copies in packages/convex-angular, and nothing copies
// one to the other: edit both together. Run with `node --test '.github/scripts/*.test.mjs'` from the
// repository root, as `pnpm test:ci-scripts` does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('packages/convex-angular/README.md is identical to the root README.md', () => {
  const root = readFileSync('README.md', 'utf8');
  const packaged = readFileSync('packages/convex-angular/README.md', 'utf8');
  // Compare with `===` so a failure prints this message instead of a 13 KB string diff.
  assert.ok(root === packaged, 'README.md and packages/convex-angular/README.md differ; copy one over the other');
});

test('packages/convex-angular/LICENSE is identical to the root LICENSE', () => {
  const root = readFileSync('LICENSE', 'utf8');
  const packaged = readFileSync('packages/convex-angular/LICENSE', 'utf8');
  assert.ok(
    root === packaged,
    'LICENSE and packages/convex-angular/LICENSE differ; copy the root LICENSE over the other',
  );
});
