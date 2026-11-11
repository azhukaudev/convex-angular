// The convex peer floor is declared once, in the package manifest, and repeated in the CI matrix
// that installs it and in AGENTS.md. Run from the repository root, as `pnpm test:ci-scripts` does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The same `>=X.Y.Z` read as .github/scripts/peer-floor-advisories.mjs.
const range = JSON.parse(readFileSync('packages/convex-angular/package.json', 'utf8')).peerDependencies.convex;
const floor = /^>=\s*(\d+\.\d+\.\d+)/.exec(range)?.[1];

test('the convex peer range declares a >=X.Y.Z floor', () => {
  assert.ok(floor, `cannot read a >=X.Y.Z floor from convex@"${range}"`);
});

test('the convex-peer-range CI matrix installs the declared floor and the newest release of its major', () => {
  assert.ok(floor, `cannot read a >=X.Y.Z floor from convex@"${range}"`);
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const matrix = /^\s*convex: \[(.*)\]\s*$/m.exec(ci)?.[1];
  assert.ok(matrix, 'no `convex: [...]` matrix line in .github/workflows/ci.yml');
  const legs = matrix.split(',').map((leg) => leg.trim().replace(/^'(.*)'$/, '$1'));
  assert.deepEqual(legs, [floor, `^${floor.split('.')[0]}`]);
  assert.ok(ci.includes(`# '${floor}' is the declared peer floor`), 'update the matrix comment in ci.yml');
});

test('AGENTS.md names the declared convex peer floor', () => {
  assert.ok(readFileSync('AGENTS.md', 'utf8').includes(`declared peer floor (\`${floor}\`)`));
});
