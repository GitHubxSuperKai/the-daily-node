// Smoke test: runs build.js, asserts index.html is generated and well-formed.
// Catches the "blank page" failure mode (combined imports, missing files, broken regex).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'index.html');

// 1. Run the build
let buildOut;
try {
  buildOut = execSync('node build.js', { cwd: ROOT, encoding: 'utf8' });
} catch (err) {
  console.error('FAIL: build.js exited non-zero');
  console.error(err.stdout || '', err.stderr || '');
  process.exit(1);
}
assert.ok(buildOut.includes('✓ Built index.html'), 'build.js did not print success line');

// 2. Output must exist and be non-trivial
// Floor is ~250KB: react-dom alone is ~130KB + react ~11KB + app code.
// A value below 250KB means vendor inlining or major app code is missing.
assert.ok(fs.existsSync(OUT), 'index.html was not created');
const html = fs.readFileSync(OUT, 'utf8');
assert.ok(html.length > 250_000, `output suspiciously small (${html.length} bytes) — vendor inlining or app code may be missing`);

// 3. Output must contain the concatenated marker that build.js replaces
assert.ok(!html.includes('/* MODULES CONCATENATED BY build.js */'),
  'placeholder was not replaced — build did not concat modules');

// 4. Sanity-check that key components landed in the bundle.
// Note: minification mangles function/variable names, so we check string
// literals and object-property names that survive minification unchanged.
const REQUIRED_MARKERS = [
  'dailynode-prefs',       // App.jsx (localStorage key — string literal)
  '127.0.0.1:3002',        // hooks/useHistory.js (HISTORY_BASE constant — string literal)
  'fetchBTCPrice',         // utils/api.js (object property key)
  'fmtPrice',              // utils/formatting.js (object property key)
  'METEOCONS_SVG',         // utils/svg.js (object property key)
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

// 7. Babel CDN and runtime must be absent (replaced by esbuild JSX transform + inlined vendor)
assert.ok(!html.includes('text/babel'),
  'text/babel script type present — Babel runtime not fully removed');
assert.ok(!html.includes('babel.min'),
  'babel.min.js reference present — Babel CDN not fully removed');
assert.ok(!html.includes('unpkg.com/react'),
  'unpkg.com/react CDN reference present — should use inlined vendor');
assert.ok(!html.includes('unpkg.com/react-dom'),
  'unpkg.com/react-dom CDN reference present — should use inlined vendor');

// 8. Vendored React is embedded (createRoot is exported by ReactDOM production build)
assert.ok(html.includes('createRoot'),
  'createRoot not found — vendored ReactDOM may not be inlined');

// 9. JSX was transformed at build time (esbuild produces createElement calls)
assert.ok(html.includes('createElement'),
  'createElement not found — JSX transform may have failed');

// 9b. Build-time __VERSION__ define was replaced with actual version string
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.ok(html.includes(`"v${version}"`),
  `version string "v${version}" not found — __VERSION__ define may not have been replaced`);

// 10. CSP meta tag must be present with required directives
assert.ok(html.includes('Content-Security-Policy'),
  'CSP meta tag missing from output');
const REQUIRED_CSP_HOSTS = [
  'api.kraken.com',
  'api.coingecko.com',
  'mempool.space',
  'api.open-meteo.com',
  'api.rss2json.com',
  '127.0.0.1:3001',
];
for (const host of REQUIRED_CSP_HOSTS) {
  assert.ok(html.includes(host),
    `CSP missing required connect-src host: ${host}`);
}
assert.ok(html.includes('frame-ancestors'),
  'CSP missing frame-ancestors directive');

// 11. The 900px mobile breakpoint must stay in sync across all three checks.
// The inline updateScale() script is copied into the output verbatim (only the
// bundle is minified), so both sides are assertable against the built HTML.
// The third check, useViewportMode(900) in App.jsx, survives as `An(900)` or similar —
// the identifier is mangled by minification, so it cannot be reliably matched here. It
// is pinned by tests/unit/App.test.jsx ("renders the MOBILE tree at exactly the 900px
// breakpoint") instead.
assert.ok(/isMobile\s*=\s*vw\s*<=\s*900/.test(html),
  'updateScale() breakpoint drifted — must be `vw <= 900` to match @media (max-width: 900px)');
// Anchored on an opening rule block, not the media text alone: the SYNC: comment inside
// the inline script also reads "@media (max-width:900px)" and satisfies a looser match,
// so a looser assertion passes even when the real rule has drifted. Requiring `{` right
// after the `)` is what excludes the comment. Everything between there and `#canvas {`
// is left loose so reordering rules or declarations inside the block does not trip this.
assert.ok(/@media\s*\(max-width:\s*900px\)\s*\{[^@]*?#canvas\s*\{/.test(html),
  'mobile media query breakpoint drifted — the #canvas rule must sit under `max-width: 900px` to match updateScale()');

// 12. Canvas scaling depends on SCRIPT ORDER and on the scaling script staying synchronous.
//     The inline <script> in src/index.html defines updateScale(), which sets --u before
//     React's first paint. src/index.html is copied verbatim apart from placeholder
//     substitution, so this script is NOT minified and its identifiers survive by name
//     (unlike the esbuild bundle — see the note on markers in step 4).
//     If it were moved after the bundle, given defer/async, or made type="module", --u would
//     stay at the :root default of 1px and the canvas would render unscaled with no error
//     and no console warning.
const scaleIdx = html.indexOf('function updateScale');
// build.js replaces the /* MODULES CONCATENATED BY build.js */ placeholder with requireShim +
// bundle; `var __dn_modules` is the first line of that shim, so it marks the bundle script.
const bundleIdx = html.indexOf('var __dn_modules');
assert.ok(scaleIdx !== -1, 'inline updateScale() scaling script missing from build');
assert.ok(bundleIdx !== -1,
  'require shim missing from build — cannot locate the bundle script (if you renamed __dn_modules in build.js, update this anchor)');
assert.ok(scaleIdx < bundleIdx,
  'inline scaling script must come BEFORE the bundle script — otherwise --u is unset at React first paint and the canvas renders at 1px unscaled');

// Locate the enclosing <script> tag, then prove it is a real tag and not one quoted inside
// markup. src/index.html carries a literal "<script" in the CSP explainer comment in <head>,
// and the first real "</script" is ~16KB further on, so "no closing tag in between" does NOT
// on its own rule that decoy out — the comment-exclusion test below is what does.
const scaleTagStart = html.lastIndexOf('<script', scaleIdx);
assert.ok(scaleTagStart !== -1 && !html.slice(scaleTagStart, scaleIdx).includes('</script'),
  'could not locate the opening <script> tag of the scaling block — the "function updateScale" anchor matched outside a script element');
assert.ok(html.lastIndexOf('<!--', scaleTagStart) <= html.lastIndexOf('-->', scaleTagStart),
  'the <script> tag located for the scaling block sits inside an HTML comment — the "function updateScale" anchor has drifted (a comment mentioning it?)');
const scaleTagEnd = html.indexOf('>', scaleTagStart) + 1;
const scaleTag = html.slice(scaleTagStart, scaleTagEnd);
assert.ok(!/\bdefer\b|\basync\b|type\s*=\s*["']?module\b/.test(scaleTag),
  `inline scaling <script> must stay synchronous (no defer/async/type="module"): ${scaleTag}`);

// Scope the body checks to this script so another block cannot satisfy them by accident.
const scaleClose = html.indexOf('</script', scaleTagEnd);
assert.ok(scaleClose !== -1, 'scaling <script> is never closed — cannot scope the body assertions');
const scaleBody = html.slice(scaleTagEnd, scaleClose);
// Anchored at column 0 deliberately: `^\s*` would also match the call indented inside a
// DOMContentLoaded/setTimeout callback, which is the regression this assertion exists to catch.
assert.ok(/^updateScale\(\);$/m.test(scaleBody),
  'scaling script must call updateScale() unindented at top level, at parse time — deferring it behind load/DOMContentLoaded/setTimeout leaves --u at 1px through React first paint');
assert.ok(/window\.updateScale\s*=\s*updateScale/.test(scaleBody),
  'window.updateScale assignment missing — scripts/capture-mobile.cjs calls it to force a rescale');

// Track A assertions
if (!/feeds\.bitcoinMagazine/.test(html)) { console.error('FAIL: SettingsPanel missing from build'); process.exit(1); }
if (!/minerOffline/.test(html))       { console.error('FAIL: useAlerts missing from build'); process.exit(1); }
if (!/checkFeeThreshold/.test(html))  { console.error('FAIL: alertThresholds missing from build'); process.exit(1); }
if (!/dn\.prefs\.v2/.test(html))      { console.error('FAIL: v2prefs PREFS_KEY missing from build'); process.exit(1); }

// Track B assertions
if (!/127\.0\.0\.1:3002/.test(html))  { console.error('FAIL: history daemon URL missing from build'); process.exit(1); }

console.log('✓ smoke-build OK');
