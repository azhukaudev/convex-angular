// Decides which expensive CI jobs a change needs. Prints two `key=value` lines
// (appended to $GITHUB_OUTPUT in CI):
//
//   library=true|false  whether the change can affect the published library, so
//                       the convex peer-range job must run
//   mutate=full|none|<comma-separated files>
//                       what Stryker should mutate: everything, nothing, or only
//                       the library source files the change touched
//
// Usage: node .github/scripts/ci-changes.mjs <base>   (the commit or ref to diff against:
//                                                      origin/<base branch> for a pull request,
//                                                      github.event.before for a push)
//        node .github/scripts/ci-changes.mjs          (no base: run all)
//
// A base that is empty, all zeros (a new branch), unknown to this clone (typically a force
// push), or sharing no history with HEAD gets the full answer.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, matchesGlob } from 'node:path';

import strykerConfig from '../../stryker.config.mjs';

const LIBRARY = 'packages/convex-angular/';

// `mutate` in stryker.config.mjs is the single source of truth for what Stryker mutates.
// Stryker applies the patterns in order (a `!` pattern removes what the earlier ones added);
// folding them the same way keeps this script faithful to it, and `matchesGlob` is
// minimatch-compatible for the plain `**`/`*` globs the config uses.
const MUTATE = strykerConfig.mutate;

const inMutateScope = (file) => MUTATE.some((pattern) => !pattern.startsWith('!') && matchesGlob(file, pattern));

const isMutated = (file) =>
  MUTATE.reduce(
    (mutated, pattern) =>
      pattern.startsWith('!') ? mutated && !matchesGlob(file, pattern.slice(1)) : mutated || matchesGlob(file, pattern),
    false,
  );

// Files that change what the mutation run itself means: any of these runs everything.
// `.github/workflows/ci.yml` is deliberately NOT here (see LIBRARY_AFFECTING_FILES).
const FULL_RUN_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'stryker.config.mjs',
  '.nvmrc',
  '.github/scripts/ci-changes.mjs',
  `${LIBRARY}package.json`,
  `${LIBRARY}jest.config.cjs`,
  `${LIBRARY}src/test-setup.ts`,
  `${LIBRARY}src/lib/types.ts`,
]);

// Outside the library, these can still change how the library builds or tests. ci.yml is
// here (the peer-range job is cheap, ~1 minute) but not in FULL_RUN_FILES: Dependabot bumps
// its action SHAs almost weekly, and a ~27-minute full mutation run for that is pure noise.
// Trade-off: a hand edit to the Stryker step in ci.yml no longer forces a full run; touch
// stryker.config.mjs or run `pnpm test:mutation` locally to re-check it.
const LIBRARY_AFFECTING_FILES = new Set([...FULL_RUN_FILES, '.github/workflows/ci.yml']);

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

export function decide(changed) {
  const library = changed.some((file) => file.startsWith(LIBRARY) || LIBRARY_AFFECTING_FILES.has(file));
  const toMutate = new Set();

  for (const file of changed) {
    if (FULL_RUN_FILES.has(file) || (file.startsWith(LIBRARY) && /tsconfig.*\.json$/.test(file))) {
      return { library, mutate: 'full' };
    }
    if (isMutated(file)) {
      toMutate.add(file);
    } else if (file.endsWith('.spec.ts') && inMutateScope(file)) {
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

// The files changed since `base`, or null when there is no usable base. An empty base needs
// its own check (`git diff ...HEAD` would quietly diff HEAD against itself); an all-zeros
// "before" (a new branch), a commit missing from this clone (a force push) and a base sharing
// no history with HEAD all make `git diff` exit 128. The three-dot form diffs against the
// merge base, so a pull request whose base branch has moved on since the run started is fine.
function changedFiles(base) {
  if (!base) {
    return null;
  }
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main(base) {
  const changed = changedFiles(base);
  const result = changed ? decide(changed) : { library: true, mutate: 'full' };

  const lines = `library=${result.library}\nmutate=${result.mutate}\n`;
  process.stdout.write(lines);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  }
}

// Run only as a CLI, so the spec can import `decide` without executing a diff.
// Needs Node >= 24.8 (`import.meta.main` and a stable `path.matchesGlob`); CI pins `.nvmrc` (24) for this job.
if (import.meta.main) {
  main(process.argv[2]);
}
