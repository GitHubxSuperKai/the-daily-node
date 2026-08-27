#!/usr/bin/env node
const { execSync } = require('child_process');

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
const SKIP = [/node_modules\//, /\.git\//, /package-lock\.json$/, /scripts\/check-secrets\.cjs$/, /index\.html$/, /setup\.html$/];

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
const isReserved = m => RESERVED.has(m.replace(/\s+/g, ' ').trim());

const stagedRaw = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
const staged = stagedRaw ? stagedRaw.split('\n') : [];
const targets = staged.filter(f => !SKIP.some(rx => rx.test(f)));

let failed = false;
for (const f of targets) {
  let content;
  try { content = require('fs').readFileSync(f, 'utf8'); } catch { continue; }
  const exempt = FIXTURE_PATH.test(f);
  for (const { name, regex } of BANNED) {
    // Fresh /g regex per file so no lastIndex state carries between iterations.
    // matchAll requires /g; adding it twice is a SyntaxError, so add it only if absent.
    const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    const hits = [...content.matchAll(new RegExp(regex.source, flags))];
    const offenders = exempt ? hits.filter(m => !isReserved(m[0])) : hits;
    if (offenders.length) {
      console.error(`✗ ${f}: matches ${name}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nSecrets check failed. Override committed values with localStorage, do not commit them.');
  process.exit(1);
}
console.log(`✓ checked ${targets.length} staged files, no banned patterns`);
