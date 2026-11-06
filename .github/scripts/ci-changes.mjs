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
//        node .github/scripts/ci-changes.mjs          (no usable base: run all)
//
// A base that is empty, all zeros (a new branch), unknown to this clone (typically a force
// push), or sharing no history with HEAD gets the full answer.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import strykerConfig from '../../stryker.config.mjs';

const LIBRARY = 'packages/convex-angular/';

// `mutate` in stryker.config.mjs is the single source of truth for what Stryker mutates.
// Only the pattern shapes that file uses today are understood; anything else throws, so a
// new shape fails loudly here instead of silently drifting from the config.
export function parseMutatePatterns(patterns) {
  const roots = []; // 'dir/**/*.ts' -> 'dir/'
  const excludedSuffixes = []; // '!**/*.spec.ts' -> '.spec.ts'
  const excludedNames = new Set(); // '!**/index.ts' -> 'index.ts'
  const excludedFiles = new Set(); // '!path/to/file.ts' -> 'path/to/file.ts'
  for (const pattern of patterns) {
    let match;
    if (!pattern.startsWith('!')) {
      match = /^([^*]+\/)\*\*\/\*\.ts$/.exec(pattern);
      if (!match) throw new Error(`Unsupported stryker mutate pattern: ${pattern}`);
      roots.push(match[1]);
    } else if ((match = /^!\*\*\/\*(\.[\w.]+)$/.exec(pattern))) {
      excludedSuffixes.push(match[1]);
    } else if ((match = /^!\*\*\/([^*/]+)$/.exec(pattern))) {
      excludedNames.add(match[1]);
    } else if ((match = /^!([^*]+)$/.exec(pattern))) {
      excludedFiles.add(match[1]);
    } else {
      throw new Error(`Unsupported stryker mutate pattern: ${pattern}`);
    }
  }
  return { roots, excludedSuffixes, excludedNames, excludedFiles };
}

const MUTATE = parseMutatePatterns(strykerConfig.mutate);

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

const isMutated = (file) =>
  MUTATE.roots.some((root) => file.startsWith(root)) &&
  file.endsWith('.ts') &&
  !MUTATE.excludedSuffixes.some((suffix) => file.endsWith(suffix)) &&
  !MUTATE.excludedNames.has(basename(file)) &&
  !MUTATE.excludedFiles.has(file) &&
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

export function decide(changed) {
  const library = changed.some((file) => file.startsWith(LIBRARY) || LIBRARY_AFFECTING_FILES.has(file));
  const toMutate = new Set();

  for (const file of changed) {
    if (FULL_RUN_FILES.has(file) || (file.startsWith(LIBRARY) && /tsconfig.*\.json$/.test(file))) {
      return { library, mutate: 'full' };
    }
    if (isMutated(file)) {
      toMutate.add(file);
    } else if (file.endsWith('.spec.ts') && MUTATE.roots.some((root) => file.startsWith(root))) {
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

// Whether `base` names a commit that `git diff base...HEAD` can use: set, not the all-zeros
// "before" of a new branch, present in this clone, and sharing history with HEAD. Not "an
// ancestor of HEAD": a pull request's merge commit stops descending from origin/<base> as soon
// as the base branch moves (e.g. on a re-run), and the three-dot diff copes via the merge base.
export function isUsableBase(base, git = (args) => execFileSync('git', args, { stdio: 'ignore' })) {
  if (!base || /^0+$/.test(base)) {
    return false;
  }
  try {
    git(['merge-base', base, 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function main(base) {
  const result = isUsableBase(base)
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
}

// Run only as a CLI, so the spec can import `decide` without executing a diff.
// `import.meta.main` needs Node >= 24.2 (or 22.18); `.nvmrc` is 24.
if (import.meta.main) {
  main(process.argv[2]);
}
