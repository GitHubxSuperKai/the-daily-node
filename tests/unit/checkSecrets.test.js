// Behaviour test for scripts/check-secrets.cjs -- the pre-commit + CI secrets gate.
//
// Why this exists: scripts/smoke-build.cjs step 15 already guards that scanner, but it
// is a STRUCTURAL check -- it regex-matches the source text of SKIP, FIXTURE_PATH and
// RESERVED. It therefore cannot see a gate that is still shaped right and no longer
// does anything. All three of these keep step 15 green while exempting the whole
// fixture surface:
//
//     const exempt = FIXTURE_PATH.test(f) || true;
//     const offenders = exempt ? [] : hits;
//     const isReserved = () => true;
//
// (step 15's comment strip only drops `//` lines, so wrapping the call in a block
// comment also satisfies its gate-presence assertion.) Only running the scanner
// catches those, which is what every case below does.
//
// It lives in vitest specifically. .github/workflows/build.yml runs `npm run test:unit`
// and enumerates its other steps individually -- it never runs `npm test`, so a check
// wired only into that chain gets zero CI coverage.
//
// Each case drives the real CLI end-to-end in a throwaway git repo. The scanner reads
// `git diff --cached --name-only` and then reads each staged path off disk, so a
// staged temp repo is the only way to exercise it without touching this repo's index.
//
// This runs under the suite-wide jsdom environment even though nothing here needs a
// DOM. Do not add a per-file environment docblock to opt into node: tests/setup.js
// touches `document` at import time and runs for every file, so the suite fails at
// load. Note also that vitest scans the whole file for that pragma, so even naming it
// in a comment switches the environment -- write it out and this file stops running.
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCANNER = path.join(REPO_ROOT, 'scripts', 'check-secrets.cjs');

// Not one private-looking literal is spelled out in this file. Every address and
// coordinate below is assembled at runtime from parts that match nothing on their own,
// so this file stays clean under its own scanner instead of depending on the tests/
// carve-out it exists to test -- otherwise narrowing FIXTURE_PATH later would break
// the commit that narrows it, and the reserved values would be pinned in two places.
const dotted = (...parts) => parts.join('.');
const geo = (key, value, gap = ' ') => `${key}:${gap}${value}`;

// Values from the scanner's RESERVED set, rebuilt. Any of these is exempt ONLY on the
// fixture surface (tests/ and root-level test_*.py).
const RESERVED_IP_192 = dotted(192, 168, 1, 10);
const RESERVED_IP_10 = dotted(10, 0, 0, 1);
const RESERVED_LAT = 34.05;

// Values that are NOT reserved and must fail everywhere.
const OFF_BY_ONE_IP = dotted(192, 168, 1, 12);        // neighbour of a reserved value
const LONGER_IP = dotted(10, 0, 0, 10);               // a reserved value is a prefix of it
const PLAIN_10 = dotted(10, 1, 2, 3);
const PLAIN_172 = dotted(172, 20, 1, 1);              // the reserved one is 172.16.x
const PLAIN_192 = dotted(192, 168, 77, 8);
// Malformed dotted runs. These were real bypasses of an earlier implementation that
// blanked reserved values out of the content before matching: masking the reserved
// 10.0.0.2 inside the first string destroyed the leading hit the 10.x pattern had.
const SPLICE_10 = dotted(10, 0, 0, 10, 0, 0, 2);
const SPLICE_192 = dotted(192, 168, 10, 0, 0, 1);

const tmpDirs = [];

function git(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

// Builds a throwaway repo holding `files` ({ 'rel/path': contents }), stages all of
// it, and runs the scanner there. -f on the add so a stray global excludesFile cannot
// silently drop a file from the staged set and turn a would-be failure into a pass.
function scanFiles(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-secrets-'));
  tmpDirs.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }
  git(['init', '-q', '.'], dir);
  git(['add', '-A', '-f', '.'], dir);
  const r = spawnSync(process.execPath, [SCANNER], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Asserting on the message, not just the exit code: a scanner that exits 1 for the
// wrong file, or that exits 0 having read nothing, is still broken. The scanner's own
// output uses check/cross glyphs; match the ASCII part of it so console encoding on
// Windows cannot decide whether this suite passes.
function expectAccepted(result) {
  expect(result.stderr, 'expected a clean scan, got offenders').toBe('');
  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/checked \d+ staged files/);
}

function expectRejected(result, offendingPath) {
  expect(result.code, `expected a rejection, scanner said: ${result.stdout.trim()}`).toBe(1);
  expect(result.stderr).toContain(`${offendingPath}: matches`);
}

function scannedCount(result) {
  const m = result.stdout.match(/checked (\d+) staged files/);
  expect(m, `no scan count in stdout: ${result.stdout}`).not.toBeNull();
  return Number(m[1]);
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('check-secrets: the real repo', () => {
  // Mirrors SKIP in check-secrets.cjs. Duplicated deliberately: smoke-build step 15
  // pins the real list, so a change there surfaces here as a loud count mismatch
  // rather than as coverage quietly shrinking.
  const SKIP = [
    /node_modules\//, /\.git\//, /package-lock\.json$/,
    /scripts\/check-secrets\.cjs$/, /index\.html$/, /setup\.html$/,
  ];

  it('passes over every file it would actually see in this repo', () => {
    // Enumerated the way check-review-paths.cjs does it: tracked files plus untracked
    // ones git does not ignore, which is exactly the set a `git add -A` could stage.
    const enumerated = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    ).split('\0').filter(Boolean);

    const present = enumerated.filter(f => fs.existsSync(path.join(REPO_ROOT, f)));
    expect(present.length, 'enumerated no files -- this case is not testing anything').toBeGreaterThan(50);

    const files = {};
    for (const rel of present) files[rel] = fs.readFileSync(path.join(REPO_ROOT, rel));
    const result = scanFiles(files);

    expectAccepted(result);
    // No hardcoded total: the count is derived from the tree, so adding a file (this
    // one included) does not make the assertion stale, and a SKIP entry that starts
    // swallowing real files still fails.
    const expected = present.filter(f => !SKIP.some(rx => rx.test(f))).length;
    expect(scannedCount(result)).toBe(expected);
  }, 120_000);
});

describe('check-secrets: the carve-out is path-scoped', () => {
  it('rejects a private address planted under docs/', () => {
    expectRejected(
      scanFiles({ 'docs/ARCHITECTURE.md': `The node answers on ${PLAIN_192} in the lab.\n` }),
      'docs/ARCHITECTURE.md',
    );
  });

  it('rejects a non-reserved private address under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/unit/thing.test.js': `const host = '${PLAIN_10}';\n` }),
      'tests/unit/thing.test.js',
    );
  });

  it('rejects a RESERVED literal placed in src/', () => {
    // The reserved values buy nothing outside the fixture surface. If this case ever
    // passes, the exempt gate has been hollowed out even though FIXTURE_PATH still
    // reads correctly.
    expectRejected(
      scanFiles({ 'src/config.js': `export const HOST = '${RESERVED_IP_192}';\n` }),
      'src/config.js',
    );
  });

  it('rejects a planted address in a python test under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/test_miner.py': `HOST = "${PLAIN_172}"\n` }),
      'tests/test_miner.py',
    );
  });

  it('accepts a RESERVED literal in a root-level test_*.py', () => {
    // Root-level python tests are on the fixture surface too -- they were invisible
    // until the blanket test_*.py skip came off.
    expectAccepted(scanFiles({ 'test_bitaxe_api.py': `HOST = "${RESERVED_IP_10}"\n` }));
  });
});

describe('check-secrets: reserved values match whole, never by prefix', () => {
  it('rejects a value one digit off a reserved one', () => {
    expectRejected(
      scanFiles({ 'tests/unit/thing.test.js': `const host = '${OFF_BY_ONE_IP}';\n` }),
      'tests/unit/thing.test.js',
    );
  });

  it('rejects a longer address that starts with a reserved one', () => {
    expectRejected(
      scanFiles({ 'tests/unit/thing.test.js': `const host = '${LONGER_IP}';\n` }),
      'tests/unit/thing.test.js',
    );
  });

  it('rejects malformed dotted runs built around reserved values', () => {
    // Regression cases for the masking implementation that these bypassed.
    expectRejected(
      scanFiles({ 'tests/unit/splice10.test.js': `const s = '${SPLICE_10}';\n` }),
      'tests/unit/splice10.test.js',
    );
    expectRejected(
      scanFiles({ 'tests/unit/splice192.test.js': `const s = '${SPLICE_192}';\n` }),
      'tests/unit/splice192.test.js',
    );
  });
});

describe('check-secrets: coordinates', () => {
  it('rejects a non-reserved coordinate under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/unit/where.test.js': `const p = { ${geo('lat', 48.85)} };\n` }),
      'tests/unit/where.test.js',
    );
  });

  it('accepts a reserved coordinate written without the space', () => {
    // The scanner re-spaces the key before comparing, so the reserved spelling does
    // not have to be typed exactly. Without that it would fail closed on a fix
    // ("add a space after the colon") that nothing in the error message hints at.
    expectAccepted(
      scanFiles({ 'tests/unit/where.test.js': `const p = { ${geo('lat', RESERVED_LAT, '')} };\n` }),
    );
  });

  it('rejects a non-reserved coordinate written without the space', () => {
    expectRejected(
      scanFiles({ 'tests/unit/where.test.js': `const p = { ${geo('lat', 34.06, '')} };\n` }),
      'tests/unit/where.test.js',
    );
  });
});

describe('check-secrets: controls', () => {
  // Without these, every rejection above is also satisfied by a scanner that rejects
  // everything -- which is the failure mode a green-forever gate gets "fixed" into.
  it('accepts a RESERVED literal under tests/', () => {
    expectAccepted(
      scanFiles({ 'tests/unit/ipValidation.test.js': `expect(isValidLanIp('${RESERVED_IP_192}')).toBe(true);\n` }),
    );
  });

  it('accepts a clean docs/ prose edit', () => {
    const result = scanFiles({ 'docs/ARCHITECTURE.md': 'The node answers on `<lan-host>` in the lab.\n' });
    expectAccepted(result);
    expect(scannedCount(result)).toBe(1);
  });
});
