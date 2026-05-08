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

// Files to skip (build artifacts are excluded — source files are the real gate)
const SKIP = [/node_modules\//, /\.git\//, /package-lock\.json$/, /docs\//, /tests\//, /scripts\/check-secrets\.cjs$/, /index\.html$/];

const stagedRaw = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
const staged = stagedRaw ? stagedRaw.split('\n') : [];
const targets = staged.filter(f => !SKIP.some(rx => rx.test(f)));

let failed = false;
for (const f of targets) {
  let content;
  try { content = require('fs').readFileSync(f, 'utf8'); } catch { continue; }
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
