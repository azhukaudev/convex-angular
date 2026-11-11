// Run with `node --test '.github/scripts/*.test.mjs'` from the repository root: `decide()`
// checks which files exist relative to the working directory.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const script = fileURLToPath(new URL('./ci-changes.mjs', import.meta.url));
// No GITHUB_OUTPUT (the CLI would append to it), and no GIT_* variables (inside a git hook
// GIT_DIR would point the temporary repositories below at this one).
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'GITHUB_OUTPUT' && !name.startsWith('GIT_')),
);

// The CLI is what CI runs. A base it cannot diff against must fall back to the full answer
// rather than an empty or partial one.
test('a base that cannot be diffed gets the full answer', () => {
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

// A force push that rewinds main leaves the push's `before` commit unreachable from every ref, so
// even a full-history clone lacks it. The script must fetch it by SHA instead of running everything.
test('a push base missing from the clone is fetched from origin and diffed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-changes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, 'origin');
  const clone = join(dir, 'clone');
  const identity = ['-c', 'user.name=ci', '-c', 'user.email=ci@example.com', '-c', 'commit.gpgsign=false'];
  const git = (cwd, ...args) => execFileSync('git', [...identity, ...args], { cwd, encoding: 'utf8', env }).trim();

  git(dir, 'init', '--quiet', '--initial-branch=main', origin);
  // GitHub serves a commit no ref reaches; make the local origin do the same under any protocol version.
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  git(origin, 'commit', '--quiet', '--allow-empty', '-m', 'kept');
  writeFileSync(join(origin, 'pnpm-lock.yaml'), 'rewound away\n');
  git(origin, 'add', 'pnpm-lock.yaml');
  git(origin, 'commit', '--quiet', '-m', 'rewound');
  const rewound = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'reset', '--quiet', '--hard', 'HEAD~1');
  // file:// (not a plain path) so the clone receives only reachable objects, like a GitHub checkout.
  git(dir, 'clone', '--quiet', `file://${origin}`, clone);
  assert.notEqual(spawnSync('git', ['cat-file', '-e', rewound], { cwd: clone, env }).status, 0, 'precondition');

  const run = (base) => spawnSync('node', [script, base], { cwd: clone, encoding: 'utf8', env });
  const rewind = run(rewound);
  assert.equal(rewind.stdout, 'library=false\nmutate=none\n');
  assert.equal(rewind.stderr, '');

  const unknown = run('0123456789abcdef0123456789abcdef01234567');
  assert.equal(unknown.stdout, 'library=true\nmutate=full\n');
  assert.match(unknown.stderr, /ci-changes: cannot diff against base/);
});
