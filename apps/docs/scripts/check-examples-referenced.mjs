// Every compiled example must actually appear on the site. `src/examples/**` is
// a knip entry point, so knip cannot tell an orphan from a rendered file; an
// example counts as used here only if a page imports it with `?raw`, or another
// example imports it directly.
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(docsRoot, 'src/examples');
const contentDir = join(docsRoot, 'src/content');

async function walk(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(full, predicate);
      }
      return predicate(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

const exampleFiles = await walk(examplesDir, (name) => name.endsWith('.ts'));
const contentFiles = await walk(contentDir, (name) => name.endsWith('.mdx') || name.endsWith('.md'));

const referenced = new Set();

// Pages reach examples through `import x from '../../../examples/foo.ts?raw'`.
for (const file of contentFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+'([^']*\/examples\/[^']+?\.ts)\?raw'/g)) {
    referenced.add(resolve(dirname(file), match[1]));
  }
}

// Examples may also be composed from shared helpers such as convex/api.ts.
for (const file of exampleFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = resolve(dirname(file), match[1]);
    referenced.add(target.endsWith('.ts') ? target : `${target}.ts`);
  }
}

const orphans = exampleFiles.filter((file) => !referenced.has(file)).sort();

if (orphans.length > 0) {
  console.error(
    `${orphans.length} example file(s) are never rendered on the site and are not imported by another example:\n` +
      orphans.map((file) => `  - ${relative(docsRoot, file)}`).join('\n') +
      `\n\nRender each file from an MDX page with a \`?raw\` import, or delete it.`,
  );
  process.exit(1);
}

console.log(`All ${exampleFiles.length} compiled examples are reachable from the site.`);
