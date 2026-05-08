// Smoke test: runs build.js, asserts Command Center.html is generated and well-formed.
// Catches the "blank page" failure mode (combined imports, missing files, broken regex).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Command Center.html');

// 1. Run the build
let buildOut;
try {
  buildOut = execSync('node build.js', { cwd: ROOT, encoding: 'utf8' });
} catch (err) {
  console.error('FAIL: build.js exited non-zero');
  console.error(err.stdout || '', err.stderr || '');
  process.exit(1);
}
assert.ok(buildOut.includes('✓ Built Command Center.html'), 'build.js did not print success line');

// 2. Output must exist and be non-trivial
assert.ok(fs.existsSync(OUT), 'Command Center.html was not created');
const html = fs.readFileSync(OUT, 'utf8');
assert.ok(html.length > 50_000, `output suspiciously small: ${html.length} bytes`);

// 3. Output must contain the concatenated marker that build.js replaces
assert.ok(!html.includes('/* MODULES CONCATENATED BY build.js */'),
  'placeholder was not replaced — build did not concat modules');

// 4. Sanity-check that key components landed in the bundle
const REQUIRED_MARKERS = [
  'function App',          // App.jsx
  'CommandCenter',         // components/CommandCenter.jsx
  'fetchBTCPrice',         // utils/api.js
  'fmtPrice',              // utils/formatting.js
  'METEOCONS_SVG',         // utils/svg.js
];
for (const m of REQUIRED_MARKERS) {
  assert.ok(html.includes(m), `missing required marker in bundle: ${m}`);
}

// 5. No raw ES import/export statements should survive the regex strip
//    build.js strips: combined default+named, default-only, named-only, bare imports, and exports.
//    Any leak would cause a blank page in the browser.
const importLeak = html.match(/^\s*import\s+/m);
assert.ok(!importLeak,
  `import statement survived build (would blank-page the app): ${importLeak && importLeak[0].trim()}`);
const exportLeak = html.match(/^\s*export\s+(default|\{|function|const|let|var|class|async)/m);
assert.ok(!exportLeak,
  `unstripped export statement survived build: ${exportLeak && exportLeak[0].trim()}`);

// 6. Vendor files must exist on disk
const vendorFiles = [
  'src/vendor/react.production.min.js',
  'src/vendor/react-dom.production.min.js',
  'src/vendor/MANIFEST.md',
];
for (const f of vendorFiles) {
  assert.ok(
    fs.existsSync(path.join(ROOT, f)),
    `Missing vendor file: ${f}`
  );
}

console.log('✓ smoke-build OK');
