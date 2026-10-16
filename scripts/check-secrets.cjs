#!/usr/bin/env node
const { execSync, execFileSync } = require('child_process');

// Patterns we never want committed
const BANNED = [
  { name: 'private RFC1918 IP (192.168.x.x)', regex: /\b192\.168\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'private RFC1918 IP (10.x.x.x)',    regex: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'private RFC1918 IP (172.16-31)',   regex: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/ },
  { name: 'non-zero latitude',                regex: /lat:\s*-?(?!0\.0|0\b)\d+\.\d+/ },
  { name: 'non-zero longitude',               regex: /lng:\s*-?(?!0\.0|0\b)\d+\.\d+/ },
];

// Files to skip (build artifacts are excluded — source files are the real gate).
// docs/ and tests/ are deliberately NOT here: they are scanned like everything
// else, with the reserved-fixture carve-out below as the only concession.
//
// setup.html is NOT here either, despite once sitting in this list under the
// "build artifacts" heading. It is hand-written and hand-committed — nothing in
// build.js or package.json produces it, it has no counterpart under src/, and it
// carries its own feature commits. Skipping it left the one tracked file that
// nothing scanned; its example addresses are now generic placeholder text.
//
// The index.html entry is ^-anchored so it covers only the built root artifact.
// Unanchored it also matched src/index.html, the hand-written page template that
// build.js reads — genuine source, and unscanned for as long as the entry read
// /index\.html$/. It scans clean today; the anchor is what keeps it scanned.
const SKIP = [/node_modules\//, /\.git\//, /package-lock\.json$/, /scripts\/check-secrets\.cjs$/, /^index\.html$/];

// Test surface the carve-out below applies to. Deliberately NOT docs/: only one
// tracked doc needed a private-looking literal and it was prose, so it was scrubbed
// to a placeholder instead. CLAUDE.md names docs/superpowers/ as this repo's
// historical leak vector, and exempting anything across that whole tree to buy one
// plan document is a bad trade.
//
// The trailing alternative covers test_bitaxe_api.py, a python test that sits at the
// repo root rather than under tests/ — same fixture role, just misfiled. It was
// invisible until the blanket test_*.py skip came off.
const FIXTURE_PATH = /^tests\/|^test_[^/]*\.py$/;

// This repo's reserved example values — the only private-looking literals allowed to
// live on the fixture surface above, and ONLY there. Everywhere else (src/, docs/,
// scripts/, .github/, .githooks/, repo root) every pattern above still fails on them.
//
// They exist because they cannot be scrubbed. tests/unit/ipValidation.test.js asserts
// isValidLanIp('192.168.1.10') === true and isValidLanIp('8.8.8.8') === false: the
// RFC1918 literals ARE that test's subject. A `<lan-host>` placeholder is not an IP,
// and an RFC5737 TEST-NET address (192.0.2.x) is not a LAN IP, so either substitution
// inverts the assertion. The rest are miner-fleet and weather fixtures fed through the
// same validation and render paths.
//
// Keep this list short: every entry is a value the scanner is permanently blind to on
// the fixture surface. All entries confirmed dead — not live infrastructure — by the
// repo owner, 2026-08-26. scripts/smoke-build.cjs step 15 guards the size of this list
// and the shape of SKIP/FIXTURE_PATH, so widening the carve-out fails the build.
const RESERVED = new Set([
  '10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.5', '10.0.0.9',
  '172.16.5.5',
  '192.168.1.10', '192.168.1.11', '192.168.1.20', '192.168.1.50',
  'lat: 34.05', 'lat: 51.5', 'lng: -118.24',
]);

// Whole-match comparison, never substitution. An earlier version blanked reserved
// values out of the content before matching, which let a malformed dotted string
// splice a real hit away: masking the 10.0.0.2 in `10.0.0.10.0.0.2` destroyed the
// leading 10.0.0.10 that the 10.x pattern was matching. Comparing each match to the
// reserved set instead removes that class entirely — a hit is exempt only if the
// matched text IS a reserved value, so 192.168.1.12 and 10.0.0.10 still fail.
//
// Residual, accepted: a malformed run built by concatenating reserved values can still
// pass on the fixture surface, because every window the patterns find in it is itself
// reserved. That conceals nothing — a non-reserved address cannot be spelled out of
// reserved ones — so it is a curiosity, not a bypass.
// Normalising whitespace is not enough on its own: collapsing runs cannot insert a
// space that was never typed, so `lat:34.05` would never equal the reserved
// `lat: 34.05`. It fails closed, but with a fix ("add a space after the colon") that is
// not discoverable from the error. Re-space the key instead, so all of `lat:34.05`,
// `lat:   34.05` and `lat:\n34.05` normalise to the one reserved spelling.
const isReserved = m => RESERVED.has(
  m.replace(/\s+/g, ' ').trim().replace(/^(lat|lng):\s*/, '$1: ')
);

// --diff-filter=d (lower case excludes) drops staged DELETIONS from the list. That is a
// real and routine case, not a hypothetical: a git rm before a local commit, and any PR
// that removes a file, once CI stages base..HEAD. The index holds no stage-0 blob for
// it any more, so there is nothing to read and nothing that could leak. Excluding it
// here — rather than letting the read throw and be swallowed — is what makes every
// remaining read failure mean that something is actually wrong.
//
// A path staged as a modification whose working-copy file is then deleted survives this
// filter and is scanned normally: the scan reads the staged blob, which still exists.
//
// -z because git C-quotes any path holding non-ASCII bytes, quotes, backslashes or
// control characters (core.quotepath, on by default): the plain listing returns
// "src/caf\303\251.js" for a file named with an accent, which is a path no
// filesystem has. That file was never scanned before this change either -- it was
// skipped in silence. Now that an unread file stops the run, the same quoting would
// block a commit AND a required CI check over a path that does not exist. The
// NUL-delimited listing is never quoted, so this closes the gap rather than only
// making it loud. No .trim(): a NUL-delimited record may legitimately end in space.
//
// --no-relative overrides a user's diff.relative=true, which would otherwise list only
// the staged paths under the cwd, relative to it: a subdirectory run would skip every
// staged file outside that directory, and print a clean result if none were inside it.
const stagedRaw = execSync('git diff --cached --no-relative --name-only --diff-filter=d -z', { encoding: 'utf8' });
const staged = stagedRaw.split('\0').filter(Boolean);

const targets = staged.filter(f => !SKIP.some(rx => rx.test(f)));

// Reads the STAGED blob, never the working copy: the index is what gets committed, so it
// is what must be scanned. Reading the working copy let a secret be staged, edited out of
// the file without re-staging, and committed unscanned. `:0:<path>` names the stage-0
// index entry and resolves from the repository root whatever the cwd, so a run from a
// subdirectory scans the same bytes as one from the root. The explicit stage number stops
// a file named like `1:x` being read as a stage. execFileSync with no shell: the path is
// one argv entry, so nothing in a filename is interpreted.
const readStaged = f => execFileSync('git', ['cat-file', 'blob', `:0:${f}`], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
});

let matched = false;
// Fail CLOSED on unreadable entries. The previous bare catch-and-continue printed the
// same success line for a run that opened nothing as for a clean full-repo scan, which is
// the one thing a gate may never do. With blob reads a failure means the index entry is
// not a readable stage-0 blob -- a gitlink (submodule) or an unmerged path. Rare, but the
// success line must not be printable while anything staged went unscanned.
const unreadable = [];
for (const f of targets) {
  let content;
  try { content = readStaged(f); }
  catch (e) {
    // The fatal:/error: line, not the last one: for an unmerged path git ends on a hint.
    const lines = String(e.stderr || '').trim().split('\n');
    const why = lines.find(l => /^(fatal|error):/.test(l)) || lines.pop() || e.code || e.message;
    unreadable.push(`${f}: ${why}`);
    continue;
  }
  const exempt = FIXTURE_PATH.test(f);
  for (const { name, regex } of BANNED) {
    // Fresh /g regex per file so no lastIndex state carries between iterations.
    // matchAll requires /g; adding it twice is a SyntaxError, so add it only if absent.
    const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    const hits = [...content.matchAll(new RegExp(regex.source, flags))];
    const offenders = exempt ? hits.filter(m => !isReserved(m[0])) : hits;
    if (offenders.length) {
      console.error(`✗ ${f}: matches ${name}`);
      matched = true;
    }
  }
}

if (matched) {
  console.error('\nSecrets check failed. Override committed values with localStorage, do not commit them.');
}
if (unreadable.length) {
  // Named, not merely counted: "3 files unreadable" is not actionable, and the list is what
  // tells you which index entries (a submodule, an unmerged path) went unscanned.
  console.error(`\n✗ could not read ${unreadable.length} of ${targets.length} staged file(s):`);
  for (const u of unreadable) console.error(`    ${u}`);
  console.error('These files were NOT scanned. Reporting that as a failure rather than as a clean');
  console.error('scan is deliberate: a pass over files nobody opened proves nothing.');
}
if (matched || unreadable.length) process.exit(1);
console.log(`✓ checked ${targets.length} staged files, no banned patterns`);
