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

// This repo's reserved example values — the only private-looking literals allowed
// to live under docs/ and tests/, and ONLY there. Everywhere else (src/, scripts/,
// .github/, .githooks/, repo root) every pattern above still fails on them.
//
// They exist because they cannot be scrubbed. tests/unit/ipValidation.test.js
// asserts isValidLanIp('192.168.1.10') === true and isValidLanIp('8.8.8.8') === false:
// the RFC1918 literals ARE that test's subject. A `<lan-host>` placeholder is not an
// IP, and an RFC5737 TEST-NET address (192.0.2.x) is not a LAN IP, so either
// substitution inverts the assertion. The rest are miner-fleet and weather fixtures
// fed through the same validation and render paths.
//
// Matching is EXACT and word-boundary anchored, so 192.168.1.12 — one digit off a
// reserved value — still fails, in tests/ as everywhere else. Keep this list short;
// every entry is a value the scanner is permanently blind to under docs/ and tests/.
// All entries confirmed dead (not live infrastructure) by the repo owner, 2026-08-26.
// Test surface the carve-out applies to. The trailing alternative covers
// test_bitaxe_api.py, a python test that sits at the repo root rather than under
// tests/ — same fixture role, same round-tripped literals, just misfiled. It was
// invisible until the blanket test_*.py skip came off.
const FIXTURE_PATH = /^(docs|tests)\/|^test_[^/]*\.py$/;
const RESERVED = [
  '10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.5', '10.0.0.9',
  '172.16.5.5',
  '192.168.1.10', '192.168.1.11', '192.168.1.20', '192.168.1.50',
  'lat: 34.05', 'lat: 51.5', 'lng: -118.24',
];

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A coordinate entry keeps its `lat:`/`lng:` key as the left anchor; an address gets
// a leading \b. Both get a trailing \b so a reserved value can never mask a longer
// one (10.0.0.1 must not blank the first 7 chars of 10.0.0.10).
const RESERVED_RX = RESERVED.map(v => {
  const coord = v.match(/^(lat|lng):\s*(.+)$/);
  return coord
    ? new RegExp(`${coord[1]}:\\s*${escape(coord[2])}\\b`, 'g')
    : new RegExp(`\\b${escape(v)}\\b`, 'g');
});

const stagedRaw = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
const staged = stagedRaw ? stagedRaw.split('\n') : [];
const targets = staged.filter(f => !SKIP.some(rx => rx.test(f)));

let failed = false;
for (const f of targets) {
  let content;
  try { content = require('fs').readFileSync(f, 'utf8'); } catch { continue; }
  // Blank out reserved fixtures before matching, so only NON-reserved hits remain.
  if (FIXTURE_PATH.test(f)) {
    for (const rx of RESERVED_RX) content = content.replace(rx, 'RESERVED_EXAMPLE');
  }
  for (const { name, regex } of BANNED) {
    if (regex.test(content)) {
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
