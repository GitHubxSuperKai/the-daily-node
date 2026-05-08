#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const manifestPath = path.join(__dirname, '..', 'src', 'vendor', 'MANIFEST.md');
const manifest = fs.readFileSync(manifestPath, 'utf8');

// Parse table rows: | filename | version | source | sha384-hex | date |
const rows = manifest
  .split('\n')
  .filter(l => l.startsWith('|') && !l.includes('---') && !l.match(/\|\s*File\s*\|/i))
  .map(l => l.split('|').map(c => c.trim()).filter(Boolean));

let failed = false;
for (const [file, version, , expected] of rows) {
  if (!file || !file.endsWith('.js')) continue;
  const fullPath = path.join(__dirname, '..', 'src', 'vendor', file);
  if (!fs.existsSync(fullPath)) {
    console.error(`✗ missing: ${file}`);
    failed = true;
    continue;
  }
  const actual = crypto.createHash('sha384').update(fs.readFileSync(fullPath)).digest('hex');
  if (actual !== expected.trim()) {
    console.error(`✗ ${file} hash mismatch:\n  expected: ${expected.trim()}\n  actual:   ${actual}`);
    failed = true;
  } else {
    console.log(`✓ ${file} (${version})`);
  }
}

if (failed) {
  console.error('Vendor verification failed.');
  process.exit(1);
}
console.log('All vendored files verified.');
