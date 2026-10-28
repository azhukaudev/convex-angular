// Fails when the lowest version a published peer range admits has a known
// advisory, which is what forces a peer-floor raise. Installed versions sit
// above the floors, so `pnpm audit` alone cannot see this.
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('packages/convex-angular/package.json', 'utf8'));
const floors = {};
for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
  const floor = /^>=\s*(\d+\.\d+\.\d+)/.exec(range)?.[1];
  if (!floor) {
    console.error(`Cannot read a >=X.Y.Z floor from ${name}@"${range}"`);
    process.exit(2);
  }
  floors[name] = [floor];
}

const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(floors),
});
if (!response.ok) {
  console.error(`Advisory lookup failed: HTTP ${response.status}`);
  process.exit(2);
}

const advisories = Object.entries(await response.json()).flatMap(([name, list]) =>
  list.map((a) => `${name}@${floors[name][0]}: ${a.severity} ${a.url} (vulnerable ${a.vulnerable_versions})`),
);
console.log(
  `Checked peer floors: ${Object.entries(floors)
    .map(([n, [v]]) => `${n}@${v}`)
    .join(', ')}`,
);
if (advisories.length > 0) {
  console.log(
    'Advisories affecting a declared peer floor — raise the floor in packages/convex-angular/package.json past the vulnerable range (and record it under Breaking Changes in CHANGELOG.md):',
  );
  for (const line of advisories) console.log(`- ${line}`);
  process.exit(1);
}
console.log('No advisories affect the declared peer floors.');
