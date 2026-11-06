// Decides which expensive CI jobs a change needs. Prints two `key=value` lines
// (appended to $GITHUB_OUTPUT in CI):
//
//   library=true|false  whether the change can affect the published library, so
//                       the convex peer-range job must run
//   mutate=full|none|<comma-separated files>
//                       what Stryker should mutate: everything, nothing, or only
//                       the library source files the change touched
//
// Usage: node .github/scripts/ci-changes.mjs <base-ref>   (pull requests)
//        node .github/scripts/ci-changes.mjs              (anything else: run all)
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const LIBRARY = 'packages/convex-angular/';

// The source roots Stryker mutates (keep in sync with `mutate` in stryker.config.mjs).
const MUTATED_ROOTS = [`${LIBRARY}src/lib/`, `${LIBRARY}testing/src/`, `${LIBRARY}better-auth/src/`];

// Files that change what the mutation run itself means: any of these runs everything.
const FULL_RUN_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'stryker.config.mjs',
  '.nvmrc',
  '.github/workflows/ci.yml',
  '.github/scripts/ci-changes.mjs',
  `${LIBRARY}package.json`,
  `${LIBRARY}jest.config.cjs`,
  `${LIBRARY}src/test-setup.ts`,
  `${LIBRARY}src/lib/types.ts`,
]);

// Outside the library, these can still change how the library builds or tests.
const LIBRARY_AFFECTING_FILES = new Set(FULL_RUN_FILES);

const isMutated = (file) =>
  MUTATED_ROOTS.some((root) => file.startsWith(root)) &&
  file.endsWith('.ts') &&
  !file.endsWith('.spec.ts') &&
  basename(file) !== 'index.ts' &&
  !FULL_RUN_FILES.has(file);

// The source a spec tests: `better-auth.service.spec.ts` → `better-auth.service.ts`, and
// `inject-query.ssr.spec.ts` → `inject-query.ts` (the longest existing name wins).
function sourceOfSpec(file) {
  const parts = basename(file, '.spec.ts').split('.');
  for (let length = parts.length; length > 0; length--) {
    const candidate = join(dirname(file), `${parts.slice(0, length).join('.')}.ts`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return join(dirname(file), `${parts.join('.')}.ts`);
}

function decide(changed) {
  const library = changed.some((file) => file.startsWith(LIBRARY) || LIBRARY_AFFECTING_FILES.has(file));
  const toMutate = new Set();

  for (const file of changed) {
    if (FULL_RUN_FILES.has(file) || (file.startsWith(LIBRARY) && /tsconfig.*\.json$/.test(file))) {
      return { library, mutate: 'full' };
    }
    if (isMutated(file)) {
      toMutate.add(file);
    } else if (file.endsWith('.spec.ts') && MUTATED_ROOTS.some((root) => file.startsWith(root))) {
      const source = sourceOfSpec(file);
      if (isMutated(source) && existsSync(source)) {
        toMutate.add(source);
      } else if (basename(source) !== 'index.ts') {
        // A spec without a same-named source file can exercise anything.
        return { library, mutate: 'full' };
      }
    }
  }

  // A deleted source file has nothing left to mutate.
  const mutate = [...toMutate].filter((file) => existsSync(file)).sort();
  return { library, mutate: mutate.length ? mutate.join(',') : 'none' };
}

const base = process.argv[2];
const result = base
  ? decide(
      execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean),
    )
  : { library: true, mutate: 'full' };

const lines = `library=${result.library}\nmutate=${result.mutate}\n`;
process.stdout.write(lines);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, lines);
}
