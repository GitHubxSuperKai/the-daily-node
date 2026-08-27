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
assert.ok(/^updateScale\(\);/m.test(scaleBody),
  'scaling script must call updateScale() unindented at top level, at parse time — deferring it behind load/DOMContentLoaded/setTimeout leaves --u at 1px through React first paint');
assert.ok(/window\.updateScale\s*=\s*updateScale/.test(scaleBody),
  'window.updateScale assignment missing — scripts/capture-mobile.cjs calls it to force a rescale');

// 13. The secrets pre-commit hook must stay intact and executable.
// This repo is PUBLIC. The hook is the fast local guard — it stops a secret before it
// is ever committed; the `secrets` job in build.yml (step 14 below) is the CI-side one,
// and it can only see the NET diff, so it cannot catch a secret that one commit adds
// and a later commit removes. Assert the hook's integrity here, where CI does run:
// .github/workflows/build.yml invokes `npm run test:smoke` directly.
const HOOK = path.join(ROOT, '.githooks', 'pre-commit');
assert.ok(fs.existsSync(HOOK),
  '.githooks/pre-commit is missing — a clone that sets core.hooksPath gets no secret scanning at all');
const hookSrc = fs.readFileSync(HOOK, 'utf8');
// CRLF here is silent death: Linux/macOS reports `bad interpreter: /bin/sh^M` and the
// commit proceeds unscanned. .gitattributes pins eol=lf; this catches a bypass of it.
assert.ok(!hookSrc.includes('\r'),
  '.githooks/pre-commit contains CR bytes — CRLF breaks the shebang on Linux/macOS and the hook silently stops running');
assert.ok(hookSrc.startsWith('#!'),
  '.githooks/pre-commit lost its shebang — git will not execute it');
// Anchored to line-start deliberately, in the style of step 12's updateScale() check.
// An unanchored /npm run check:secrets/ is satisfied by the comment above that mentions
// the command, so deleting or commenting out the real invocation slipped through green.
assert.ok(/^\s*npm run check:secrets/m.test(hookSrc),
  '.githooks/pre-commit no longer invokes check:secrets at top level — the hook would pass everything');
// A hook committed 100644 is skipped by git on Linux/macOS with no message — the same
// silent death as the CRLF case. fs.statSync().mode is meaningless on Windows, so read
// the mode git actually recorded. Skipped outside a git checkout (e.g. a source tarball).
try {
  const hookMode = execSync('git ls-files -s .githooks/pre-commit', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (hookMode) {
    assert.ok(hookMode.startsWith('100755'),
      `.githooks/pre-commit is not executable in the index (${hookMode.split(' ')[0]}) — git silently skips a non-executable hook on Linux/macOS`);
  }
} catch (e) {
  if (e instanceof assert.AssertionError) throw e;
  // Not a git checkout — nothing to assert.
}

// 14. The CI secrets job must stay wired up AND stay armed.
// A contributor who never sets core.hooksPath has no local hook, so this job is their
// only coverage — and deleting or disarming it would fail nothing else in this suite.
// Guarding against deletion is the easy half; the mutations that matter are the ones
// that leave the job present but toothless.
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'build.yml');
assert.ok(fs.existsSync(WORKFLOW), '.github/workflows/build.yml is missing — CI is gone');
const wf = fs.readFileSync(WORKFLOW, 'utf8');
const secretsJobIdx = wf.search(/^ {2}secrets:/m);
assert.ok(secretsJobIdx !== -1,
  'the `secrets` job is gone from build.yml — nothing scans a PR diff for secrets any more');
// Bound the slice at the NEXT top-level job key. Slicing to EOF only works while
// `secrets` happens to be the last job; reorder it, or append a job after it, and the
// assertions silently widen back into whole-file matches.
const afterKey = wf.slice(secretsJobIdx + 1);
const nextJobIdx = afterKey.search(/^ {2}\S[^\n]*:\s*$/m);
const secretsJobRaw = nextJobIdx === -1 ? afterKey : afterKey.slice(0, nextJobIdx);
// Strip comment lines before matching. Step 13 above documents why: an unanchored
// match is satisfied by prose that merely mentions the command, and this block's own
// preamble contains the literal `git reset --soft`. Commenting out the real line while
// leaving the comment was a green pass before this filter existed.
const secretsJob = secretsJobRaw.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

assert.ok(/^\s*run:\s*npm run check:secrets\s*$/m.test(secretsJob),
  'build.yml no longer runs check:secrets — the secrets job exists but scans nothing');
// The staging step is what makes the scan non-vacuous: without it the scanner
// sees an empty index, reports "checked 0 staged files" and passes forever.
assert.ok(/^\s*git reset --soft /m.test(secretsJob),
  'build.yml secrets job no longer stages the diff — check:secrets would scan an empty index and pass unconditionally');
// Order matters as much as presence: scanning before staging is the same empty index.
assert.ok(secretsJob.search(/^\s*git reset --soft /m) < secretsJob.search(/^\s*run:\s*npm run check:secrets\s*$/m),
  'build.yml secrets job stages the diff AFTER running the scan — the scan would see an empty index');
assert.ok(/fetch-depth:\s*0/.test(secretsJob),
  'build.yml secrets job lost fetch-depth: 0 — the base commit would be missing from the clone and the staging step would fall back or fail');
// Both of these leave the job in place and green forever, which is worse than deletion:
// the check still reports, so nobody notices it stopped meaning anything.
assert.ok(!/^\s*if:/m.test(secretsJob),
  'build.yml secrets job gained an `if:` condition — a job that skips reports success and enforces nothing');
assert.ok(!/continue-on-error/.test(secretsJob),
  'build.yml secrets job gained continue-on-error — the scan could fail and the job would still report green');

// 15. The fixture carve-out in check-secrets.cjs must stay narrow.
// Steps 13 and 14 stop the scanner being deleted or disarmed. They do not stop it being
// kept, green, and hollowed out: re-add docs//tests/ to SKIP, widen FIXTURE_PATH to //,
// or grow RESERVED to two hundred entries, and nothing else in this suite notices.
const SCANNER = path.join(ROOT, 'scripts', 'check-secrets.cjs');
assert.ok(fs.existsSync(SCANNER), 'scripts/check-secrets.cjs is missing — nothing scans for secrets at all');
// Strip comment lines first, for the reason step 14 documents: this file's own prose
// discusses docs/ and tests/ at length, so an unanchored match would be satisfied by the
// comment explaining why they are NOT skipped.
const scannerSrc = fs.readFileSync(SCANNER, 'utf8')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

// Both of the checks below are strict ALLOWLISTS, not denylists. A denylist only ever
// blocks the mutation its author happened to imagine: an earlier version of this step
// rejected `docs`/`tests` appearing in SKIP, and sailed straight past `/\.md$/`, which
// re-blinds the whole docs/ tree just as completely. check-review-paths.cjs:81 uses a
// strict allowlist (GROUP_KEYS) for exactly this reason. Widening either list is meant
// to require editing this assertion — that edit IS the review gate.
const skipLine = scannerSrc.match(/^const SKIP = \[.*$/m);
assert.ok(skipLine,
  'check-secrets.cjs no longer declares SKIP as a single line — step 15 can no longer verify it, so re-anchor this assertion rather than deleting it');
const SKIP_ALLOWED = [
  '/node_modules\\//', '/\\.git\\//', '/package-lock\\.json$/',
  '/scripts\\/check-secrets\\.cjs$/', '/^index\\.html$/',
];
const skipEntries = skipLine[0].match(/\/(?:\\.|[^/\\])+\/[gimsuy]*/g) || [];
assert.deepStrictEqual(skipEntries, SKIP_ALLOWED,
  `check-secrets.cjs changed SKIP to ${JSON.stringify(skipEntries)} — every entry here is a file the scanner never reads, so adding one silently drops coverage (a bare /\\.md$/ would re-blind the entire docs/ tree). If the change is deliberate, update SKIP_ALLOWED in this assertion too.`);

const fixtureLine = scannerSrc.match(/^const FIXTURE_PATH = .*$/m);
assert.ok(fixtureLine,
  'check-secrets.cjs no longer declares FIXTURE_PATH as a single line — step 15 can no longer verify the carve-out is bounded');
const fixtureRx = fixtureLine[0].match(/=\s*\/(.+)\/[gimsuy]*;\s*$/);
assert.ok(fixtureRx,
  'FIXTURE_PATH is no longer a plain regex literal — step 15 cannot verify its anchoring');
// Allowlist again, and for a sharper reason than SKIP: anchoring is NOT the property
// that bounds this carve-out. `^.*` and `^` are both ^-anchored and both match every
// file in the repo, and `^tests\/|^src\/` would hand all 13 reserved literals back to
// source while passing any "starts with ^" test. Only an exact set bounds it.
// Naive split on | means a grouped alternation like ^(tests|spec)/ also trips this;
// that is intended — a deliberate edit here is the gate.
const FIXTURE_ALLOWED = ['^tests\\/', '^test_[^/]*\\.py$'];
const fixtureAlts = fixtureRx[1].split('|');
assert.deepStrictEqual(fixtureAlts, FIXTURE_ALLOWED,
  `FIXTURE_PATH changed to ${JSON.stringify(fixtureAlts)} — this is the set of paths where the reserved literals are exempt. Widening it (^src/ especially, but also ^docs/ or a universal ^.*) reintroduces the blindness this scanner was fixed to remove. If the change is deliberate, update FIXTURE_ALLOWED in this assertion too.`);
assert.ok(/FIXTURE_PATH\.test\(/.test(scannerSrc),
  'check-secrets.cjs no longer gates the carve-out on FIXTURE_PATH — the reserved values would be exempt in every file, including src/');

const reservedBlock = scannerSrc.match(/^const RESERVED = new Set\(\[([\s\S]*?)\]\);/m);
assert.ok(reservedBlock,
  'check-secrets.cjs no longer declares RESERVED as a Set literal — step 15 cannot bound the size of the allowlist');
// Count quoted strings, not apostrophes: counting ' characters and halving reported 0
// for a double-quoted list, and let a mixed-quote list evade the cap entirely.
const reservedCount = (reservedBlock[1].match(/(['"])(?:(?!\1)[\s\S])*\1/g) || []).length;
assert.ok(reservedCount > 0 && reservedCount <= 15,
  `check-secrets.cjs RESERVED holds ${reservedCount} entries (expected 1-15) — every entry is a value the scanner is permanently blind to on the fixture surface, so growing this list needs a deliberate cap bump here`);

// 16. The CodeQL config must keep CodeQL pointed at the whole tree.
// Steps 13-15 guard the secrets scanner. Its direct sibling -- the paths-ignore list in
// .github/codeql/codeql-config.yml -- had no assertion on it at all: re-adding a file, or
// widening an entry to a glob, drops that code out of every CodeQL run while this suite
// and every CI job stay green.
//
// Delegated to a module rather than inlined here so the mutations can be EXECUTED against
// it in vitest (tests/unit/checkCodeqlConfig.test.js). A guard that is only ever run
// against the one input it passes on is the likeliest of all to be vacuous -- and a
// structural assertion cannot catch a hollowed-out gate, only a behaviour test can.
const { checkRepo: checkCodeqlRepo } = require('./check-codeql-config.cjs');
const codeqlProblems = checkCodeqlRepo();
assert.deepStrictEqual(codeqlProblems, [],
  `CodeQL config guard failed: ${codeqlProblems.join(' | ')}`);

// Track A assertions
if (!/feeds\.bitcoinMagazine/.test(html)) { console.error('FAIL: SettingsPanel missing from build'); process.exit(1); }
if (!/minerOffline/.test(html))       { console.error('FAIL: useAlerts missing from build'); process.exit(1); }
if (!/checkFeeThreshold/.test(html))  { console.error('FAIL: alertThresholds missing from build'); process.exit(1); }
if (!/dn\.prefs\.v2/.test(html))      { console.error('FAIL: v2prefs PREFS_KEY missing from build'); process.exit(1); }

// Track B assertions
if (!/127\.0\.0\.1:3002/.test(html))  { console.error('FAIL: history daemon URL missing from build'); process.exit(1); }

console.log('✓ smoke-build OK');
