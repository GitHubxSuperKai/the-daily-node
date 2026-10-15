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
// `git diff --cached --name-only` and then reads each staged blob from the index, so a
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

// Nothing the scanner's patterns match is spelled out in this file, in code OR in a
// comment. Every address and coordinate below is assembled at runtime from parts that
// match nothing on their own, so this file stays clean under its own scanner instead of
// depending on the tests/ carve-out it exists to test -- otherwise narrowing
// FIXTURE_PATH later would break the commit that narrows it, and a reserved value would
// end up pinned in a second place that nothing greps.
//
// That invariant is enforced by the self-scan case at the bottom, not by this comment.
// A structural claim nobody executes is the exact failure this whole file is about:
// the first draft asserted it here and then broke it two comments later, and passed
// only because the value it named happened to be reserved AND this file happens to sit
// on the fixture surface -- the masking case the scanner was rewritten to kill.
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
// blanked reserved values out of the content before matching: blanking the reserved
// tail of SPLICE_10 destroyed the leading, non-reserved hit the 10.x pattern had.
const SPLICE_10 = dotted(10, 0, 0, 10, 0, 0, 2);
const SPLICE_192 = dotted(192, 168, 10, 0, 0, 1);

const tmpDirs = [];

function git(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function gitOut(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function write(dir, files) {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }
}

// Builds a throwaway repo holding `files` ({ 'rel/path': contents }) and stages all of
// it. -f on the add so a stray global excludesFile cannot silently drop a file from the
// staged set and turn a would-be failure into a pass.
function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dn-secrets-'));
  tmpDirs.push(dir);
  write(dir, files);
  git(['init', '-q', '.'], dir);
  // Pinned, not inherited: core.quotepath is on by default, and the C-quoting case below
  // is only mutation-sensitive while it is on. Under an ambient core.quotepath=false the
  // case would still pass -- correctly, -z is unaffected -- but it would silently stop
  // testing the property it is named for.
  git(['config', 'core.quotepath', 'true'], dir);
  git(['add', '-A', '-f', '.'], dir);
  return dir;
}

// `cwd` is a real argument: the scanner reads index entries, which must resolve the same
// from any directory in the repo, and one case below runs it from a subdirectory to pin
// that.
function runScanner(cwd) {
  const r = spawnSync(process.execPath, [SCANNER], { cwd, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function scanFiles(files) {
  return runScanner(makeRepo(files));
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

// patternName is required, not optional: a rejection is only the right rejection if it
// came from the pattern the case is about. Without it a coordinate case is satisfied by
// an address hit, and the splice cases -- which produce one reserved and one
// non-reserved hit each -- cannot tell which of the two survived the filter.
function expectRejected(result, offendingPath, patternName) {
  expect(result.code, `expected a rejection, scanner said: ${result.stdout.trim()}`).toBe(1);
  expect(result.stderr).toContain(`${offendingPath}: matches ${patternName}`);
}

// Spelled as the scanner spells them. None of these strings is itself a match: the
// address ones stop before a fourth numeric octet.
const P_192 = 'private RFC1918 IP (192.168.x.x)';
const P_10 = 'private RFC1918 IP (10.x.x.x)';
const P_172 = 'private RFC1918 IP (172.16-31)';
const P_LAT = 'non-zero latitude';

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
    /scripts\/check-secrets\.cjs$/, /^index\.html$/,
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
      'docs/ARCHITECTURE.md', P_192,
    );
  });

  it('rejects a non-reserved private address under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/unit/thing.test.js': `const host = '${PLAIN_10}';\n` }),
      'tests/unit/thing.test.js', P_10,
    );
  });

  it('rejects a RESERVED literal placed in src/', () => {
    // The reserved values buy nothing outside the fixture surface. If this case ever
    // passes, the exempt gate has been hollowed out even though FIXTURE_PATH still
    // reads correctly.
    expectRejected(
      scanFiles({ 'src/config.js': `export const HOST = '${RESERVED_IP_192}';\n` }),
      'src/config.js', P_192,
    );
  });

  it('rejects a planted address in a python test under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/test_miner.py': `HOST = "${PLAIN_172}"\n` }),
      'tests/test_miner.py', P_172,
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
      'tests/unit/thing.test.js', P_192,
    );
  });

  it('rejects a longer address that starts with a reserved one', () => {
    expectRejected(
      scanFiles({ 'tests/unit/thing.test.js': `const host = '${LONGER_IP}';\n` }),
      'tests/unit/thing.test.js', P_10,
    );
  });

  it('rejects malformed dotted runs built around reserved values', () => {
    // Regression cases for the masking implementation that these bypassed.
    expectRejected(
      scanFiles({ 'tests/unit/splice10.test.js': `const s = '${SPLICE_10}';\n` }),
      'tests/unit/splice10.test.js', P_10,
    );
    expectRejected(
      scanFiles({ 'tests/unit/splice192.test.js': `const s = '${SPLICE_192}';\n` }),
      'tests/unit/splice192.test.js', P_192,
    );
  });
});

describe('check-secrets: coordinates', () => {
  it('rejects a non-reserved coordinate under tests/', () => {
    expectRejected(
      scanFiles({ 'tests/unit/where.test.js': `const p = { ${geo('lat', 48.85)} };\n` }),
      'tests/unit/where.test.js', P_LAT,
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
      'tests/unit/where.test.js', P_LAT,
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

describe('check-secrets: it scans the staged blob, not the working copy', () => {
  // The index is what a commit records, so the index is what has to be scanned. The
  // scanner used to read each staged path off disk, which opened a gap the pre-commit
  // hook could not see: stage a secret, edit it out of the file without re-staging, and
  // the secret committed unscanned. Both directions are pinned, because a scanner that
  // reads index AND worktree would pass the first case and fail the second.

  it('rejects a secret that is staged and then edited out of the worktree', () => {
    const dir = makeRepo({ 'src/config.js': `export const HOST = '${PLAIN_192}';\n` });
    fs.writeFileSync(path.join(dir, 'src/config.js'), "export const HOST = '<lan-host>';\n");
    expectRejected(runScanner(dir), 'src/config.js', P_192);
  });

  it('accepts a clean staged file whose unstaged worktree copy holds a secret', () => {
    const dir = makeRepo({ 'src/config.js': "export const HOST = '<lan-host>';\n" });
    fs.writeFileSync(path.join(dir, 'src/config.js'), `export const HOST = '${PLAIN_192}';\n`);
    const result = runScanner(dir);
    expectAccepted(result);
    expect(scannedCount(result)).toBe(1);
  });

  it('scans a staged file whose worktree copy was deleted without `git rm`', () => {
    // The index still carries content the commit will include, so it is scanned like any
    // other staged file. The planted address proves the read happened: an accept here is
    // also what a scanner that skipped the path would print.
    const dir = makeRepo({ 'docs/gone.md': `host ${PLAIN_192}\n` });
    fs.rmSync(path.join(dir, 'docs/gone.md'));
    expectRejected(runScanner(dir), 'docs/gone.md', P_192);
  });

  it('scans the same bytes from a subdirectory as from the root', () => {
    // Index paths resolve from the repository root whatever the cwd, so the wrong-cwd
    // failure the working-copy reader had (every read threw from a subdirectory) cannot
    // happen. Pinned both ways so a cwd-sensitive reader fails here.
    const dir = makeRepo({
      'src/config.js': 'export const HOST = "<lan-host>";\n',
      'setup.html': `<p>Example: ${PLAIN_192}</p>\n`,
    });
    expectRejected(runScanner(path.join(dir, 'src')), 'setup.html', P_192);

    const clean = makeRepo({ 'src/a.js': 'export const a = 1;\n', 'docs/b.md': 'clean\n' });
    const result = runScanner(path.join(clean, 'src'));
    expectAccepted(result);
    expect(scannedCount(result)).toBe(2);
  });

  it('lists the whole index from a subdirectory even under diff.relative=true', () => {
    // diff.relative makes `git diff` list only paths under the cwd, relative to it. A
    // subdirectory run would then miss every staged file outside it -- and with nothing
    // staged inside it, print "checked 0 staged files" over a secret elsewhere.
    const dir = makeRepo({
      'src/a.js': 'export const a = 1;\n',
      'docs/b.md': `host ${PLAIN_192}\n`,
    });
    git(['config', 'diff.relative', 'true'], dir);
    expectRejected(runScanner(path.join(dir, 'src')), 'docs/b.md', P_192);

    // The fail-OPEN form: a directory with nothing staged under it. Without the fix this
    // listed nothing and printed a clean "checked 0 staged files".
    fs.mkdirSync(path.join(dir, 'empty'));
    expectRejected(runScanner(path.join(dir, 'empty')), 'docs/b.md', P_192);
  });
});

describe('check-secrets: an unread entry is a failure, not a clean scan', () => {
  // The gate's whole value is that a green run means something. The read used to be
  // wrapped in a bare catch-and-continue, so a run that opened NOTHING printed the same
  // success line and the same exit 0 as a clean full-repo scan. Every case here asserts
  // on the absence of that success line, because the exit code alone cannot tell them
  // apart either: a scanner that crashes on startup also exits 1.
  //
  // With blob reads, the entry that cannot be read is one that is not a stage-0 blob. A
  // gitlink (submodule) is the reachable one: its index entry names a commit, not a blob.
  function addGitlink(dir, rel) {
    // Any well-formed object name will do: the commit it names is never fetched.
    git(['update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},${rel}`], dir);
  }

  it('names every entry it could not read, and the count matches the list', () => {
    const dir = makeRepo({ 'src/a.js': 'export const a = 1;\n' });
    addGitlink(dir, 'vendor/one');
    addGitlink(dir, 'vendor/two');

    const result = runScanner(dir);
    expect(result.code).toBe(1);
    expect(result.stdout, 'reported a clean scan over entries it never opened').not.toMatch(/checked \d+ staged files/);
    const header = result.stderr.match(/could not read (\d+) of (\d+) staged file\(s\)/);
    expect(header, `no unreadable-file report in: ${result.stderr}`).not.toBeNull();
    expect(Number(header[1])).toBe(2);
    expect(Number(header[2])).toBe(3);
    for (const rel of ['vendor/one', 'vendor/two']) {
      expect(result.stderr, `${rel} went unread but was not named`).toContain(rel);
    }
    expect(result.stderr, 'a readable file was reported unread').not.toMatch(/^\s+src\/a\.js:/m);
  });

  it('reads a staged path whose name git would C-quote', () => {
    // `git diff --cached --name-only` C-quotes any path with non-ASCII bytes under
    // core.quotepath, handing back a name no index or filesystem has. That file was never
    // scanned before the fail-closed change either -- it was skipped in silence -- so the
    // -z listing closes a real coverage hole rather than only making it loud. Asserted as
    // a REJECT, not an accept: an accept here is also what a scanner that skipped the file
    // entirely would print.
    const accented = `src/caf${String.fromCharCode(0xe9)}.js`;
    expectRejected(
      scanFiles({ [accented]: `const host = '${PLAIN_192}';\n` }),
      accented, P_192,
    );
  });

  it('does not trip on a staged deletion, where the file is legitimately gone', () => {
    // --diff-filter=d drops staged deletions before any read. A staged deletion is routine
    // -- `git rm` before a local commit, and any PR that removes a file, once CI stages
    // base..HEAD -- and there is no stage-0 blob left to scan.
    const dir = makeRepo({ 'docs/keep.md': 'clean\n', 'docs/drop.md': 'clean\n' });
    git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=tester', 'commit', '-qm', 'base'], dir);
    fs.appendFileSync(path.join(dir, 'docs/keep.md'), 'edited\n');
    git(['add', 'docs/keep.md'], dir);
    git(['rm', '-q', 'docs/drop.md'], dir);

    // Pins that the deletion really is staged. Without this the case passes on a repo
    // where nothing was removed at all, which is the vacuity mode a false-failure test
    // is most likely to rot into.
    const staged = gitOut(['diff', '--cached', '--name-status'], dir);
    expect(staged, 'no staged deletion -- this case is not testing anything').toMatch(/^D\s+docs\/drop\.md$/m);

    const result = runScanner(dir);
    expectAccepted(result);
    expect(scannedCount(result), 'the deleted path must be excluded, not scanned').toBe(1);
  });
});

describe('check-secrets: this file passes its own scanner off the fixture surface', () => {
  it('accepts this test file when it is staged as src/', () => {
    // The invariant at the top of this file, executed. Staging it under src/ strips
    // both concessions at once -- no FIXTURE_PATH match, so no reserved value is exempt
    // -- which means the only way to pass is to genuinely spell out nothing the
    // scanner matches. Asserted in a comment, this claim survived being false through
    // a full draft: a reserved address was written out in prose two comments below it
    // and passed on the carve-out. This case fails on the next one.
    //
    // Reads the file off disk rather than trusting the transformed module, so a
    // literal in a comment -- which is where the last one hid -- still counts.
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    // Pins that `self` is this file and not an empty string: an empty fixture is
    // trivially clean, so the ACCEPT below would pass while scanning nothing. The
    // negative control further down does NOT cover this -- it appends its own literal,
    // so it still rejects on empty `self`. Marker rather than length alone, so the
    // assertion cannot be satisfied by some other file that happens to be long.
    expect(self, 'read back the wrong file').toContain('passes its own scanner off the fixture surface');
    expect(self.length).toBeGreaterThan(2000);
    expectAccepted(scanFiles({ 'src/utils/selfScanFixture.js': self }));

    // Negative control, and the case does not earn its keep without it. An ACCEPT
    // assertion alone passes on an empty `self` and -- the reachable one -- passes
    // forever if this path ever drifts back onto the fixture surface, where the
    // reserved values are exempt again. Staging the same bytes plus one reserved
    // literal pins both: it can only fail here, so a green ACCEPT above means the
    // path is genuinely off the fixture surface and `self` genuinely holds this file.
    expectRejected(
      scanFiles({ 'src/utils/selfScanFixture.js': `${self}\n// ${RESERVED_IP_10}\n` }),
      'src/utils/selfScanFixture.js', P_10,
    );
  });
});

describe('check-secrets: patterns beyond RFC1918', () => {
  // Every value is assembled at runtime, so nothing here is itself a match. Each banned
  // shape has a reject case naming the pattern that fired, and each has a benign
  // neighbour that must PASS, so a pattern that over-matches fails as loudly as one that
  // under-matches. The benign side includes what this repo actually contains: loopback
  // binds, `config.local.js`-style filenames, and `<user>` placeholders.
  const BS = String.fromCharCode(92);
  const cases = [
    { name: 'CGNAT / Tailscale IP (100.64/10)',
      bad: dotted(100, 101, 7, 9),
      good: dotted(100, 128, 7, 9) },                 // just above 100.127, public space
    { name: 'IPv6 unique-local address (fc00::/7)',
      bad: ['fd7a', '115c', 'a1e0', '', '1'].join(':'),
      good: 'feed: fdfd stays a word' },
    { name: 'LAN hostname (.local / .lan / .home.arpa / .internal)',
      bad: `miner.${'lo'}cal`,
      good: `see src/config.${'lo'}cal.js and settings.${'lo'}cal.json` },
    { name: 'Windows user-profile path',
      bad: ['C:', 'Users', 'someone', 'repo'].join(BS),
      good: ['C:', 'Users', '<user>', 'repo'].join(BS) },
    { name: 'Unix home-directory path',
      bad: `/${'home'}/someone/repo`,
      good: `/${'home'}/<user>/repo` },
    { name: 'private key block',
      bad: `-----BEGIN OPENSSH ${'PRIVATE'} KEY-----`,
      good: '-----BEGIN PUBLIC KEY-----' },
    { name: 'API token',
      bad: `${'gh'}p_${'a1B2'.repeat(9)}`,
      good: `${'gh'}p_short` },
  ];

  for (const { name, bad, good } of cases) {
    it(`rejects: ${name}`, () => {
      expectRejected(scanFiles({ 'src/config.js': `const x = '${bad}';\n` }), 'src/config.js', name);
    });
    it(`accepts the benign neighbour of: ${name}`, () => {
      const result = scanFiles({ 'src/config.js': `const x = '${good}';\n` });
      expectAccepted(result);
    });
  }

  it('still accepts loopback, which is deliberately not banned', () => {
    expectAccepted(scanFiles({ 'server.js': `listen(3000, '${dotted(127, 0, 0, 1)}');\n` }));
  });

  it('honours no RESERVED exemption for the new patterns, even under tests/', () => {
    const { name, bad } = cases[0];
    expectRejected(scanFiles({ 'tests/unit/x.test.js': `'${bad}'\n` }), 'tests/unit/x.test.js', name);
  });
});
