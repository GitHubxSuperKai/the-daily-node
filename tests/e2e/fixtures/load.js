// Collects every fixture module for the verify harness (tests/e2e/harness.js).
//
// A fixture module is one file under public/ (recorded from a live public API by
// scripts/verify-refresh-fixtures.cjs) or backend/ (hand-written synthetic data for the
// same-origin /api/* routes and the history daemon). Each exports
//   { match, status, contentType, body }
// where `match` is a Playwright route glob. Adding a fixture is adding a file: nothing
// here or in the harness needs editing.
//
// Modules load in file-path order, so the order is the same on every machine. Two
// guards stop an added file from changing what the other fixtures mean:
//   - a duplicate `match` throws: the harness would serve whichever registered first;
//   - a catch-all `match` throws: it would answer every request, silencing the
//     harness's unstubbed-request guard.
// tests/unit/verifyFixtures.test.js checks the shape, the guards and the coverage.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// The modules are CommonJS. createRequire works the same under Playwright's transpiler
// and under vitest, which both provide __filename.
const requireModule = createRequire(__filename);

export const FIXTURE_DIRS = ['backend', 'public'].map(d => path.join(__dirname, d));

const FIELDS = ['body', 'contentType', 'match', 'status'];

// A match is a catch-all when, past its scheme, nothing literal is left to pin a host or
// a path: only glob syntax (`*`, `/`, `?`, `{`, `}`, `,`). `**`, `**/*`, `*`,
// `http*://**` and `{**,*}` all reduce to nothing; `**/api/miners` keeps "api" and
// "miners".
export function isCatchAll(match) {
  const rest = match.replace(/^[^/]*:\/\//, '');
  return !/[A-Za-z0-9]/.test(rest.replace(/[*/?{},]/g, ''));
}

export function loadFixtures(dirs) {
  const files = dirs
    .flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const byMatch = new Map();
  return files.map(file => {
    const fixture = requireModule(file);
    const keys = Object.keys(fixture).sort();
    if (keys.join() !== FIELDS.join()) {
      throw new Error(`fixtures: ${file} must export exactly { ${FIELDS.join(', ')} }, got { ${keys.join(', ')} }`);
    }
    if (typeof fixture.match !== 'string' || fixture.match === '') {
      throw new Error(`fixtures: ${file} has no match glob`);
    }
    if (isCatchAll(fixture.match)) {
      throw new Error(`fixtures: ${file} has a catch-all match '${fixture.match}'; name a host or a path`);
    }
    if (byMatch.has(fixture.match)) {
      throw new Error(`fixtures: ${byMatch.get(fixture.match)} and ${file} have the same match '${fixture.match}'`);
    }
    byMatch.set(fixture.match, file);
    return fixture;
  });
}

export default loadFixtures(FIXTURE_DIRS);
