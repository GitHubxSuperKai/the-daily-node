# The Daily Node v2 — Phase 1 (Harden) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate runtime CDN code dependencies, harden the BitAxe proxy, add CSP, pin dependencies, and ship a working 390px mobile layout — without leaving the single-file-HTML output model.

**Architecture:** Keep `build.js` as the bundler. Replace the `<script type="text/babel">` runtime transform with build-time JSX transformation via `esbuild.transform` (per-file JSX→JS, then concatenate as today). Vendor React + ReactDOM into `src/vendor/` and inline them into the output HTML. Add a CSP `<meta>` tag with a documented allowlist. Default `bitaxe_api.py` to `127.0.0.1`, gate LAN exposure behind a CLI flag, and add an `Origin`/`Referer` allowlist. Add a `useViewportMode()` hook plus a `MobileLayout` component for ≤600px viewports.

**Tech Stack:** Node 18+, esbuild 0.20.x, React 18 (UMD), Vitest 1.6, Python 3 (stdlib `http.server`), Windows host (per existing path conventions).

**Phase 2 (history sidecar, alerts, tweaks panel) is a separate plan, written after Phase 1 ships green.**

---

## File Structure

**New files:**
- `src/vendor/react.production.min.js` — pinned React 18 UMD build
- `src/vendor/react-dom.production.min.js` — pinned ReactDOM 18 UMD build
- `src/vendor/MANIFEST.md` — version, source URL, SHA-384, retrieval date for each vendored file
- `scripts/verify-vendor.cjs` — recomputes SHA-384 of each vendor file, fails if it doesn't match the manifest
- `scripts/check-secrets.cjs` — pre-commit/CI grep for committed BitAxe IPs and non-zero lat/lng
- `src/hooks/useViewportMode.js` — returns `'desktop' | 'mobile'` based on viewport width
- `src/components/MobileLayout.jsx` — single-column 390px+ mobile layout
- `tests/unit/useViewportMode.test.js` — viewport mode tests
- `tests/unit/origin-allowlist.test.py` — Python-side Origin check unit test (executed via `python -m unittest`)

**Modified files:**
- `package.json` — exact pins, no `^` / `~`
- `package-lock.json` — committed
- `build.js` — esbuild JSX transform, vendored script inlining, CSP-friendly inline output
- `src/index.html` — drop Babel `<script>`, add CSP `<meta>`, switch React script tags to a single placeholder
- `bitaxe_api.py` — `--bind` flag, default `127.0.0.1`, Origin/Referer allowlist
- `scripts/smoke-build.cjs` — assertions: no `text/babel`, no raw `import`/`export`, CSP present, vendored React present
- `src/App.jsx` — branch on `useViewportMode()` between `<CommandCenter>` and `<MobileLayout>`
- `docs/SETUP.md` — threat model + `--bind` documentation
- `CLAUDE.md` — update import-rule note (regex strip still in effect post-Phase-1; only Babel runtime is removed)
- `.husky/pre-commit` (or equivalent) — call `scripts/check-secrets.cjs`

---

## Task Order

Tasks ordered to surface integration risk early:
1. Pin dependencies (foundational, zero risk)
2. BitAxe proxy hardening (independent, no front-end coupling)
3. Secret hygiene audit (independent)
4. Vendor React/ReactDOM (prerequisite for Task 5)
5. Build pipeline + esbuild JSX (the highest-risk task; everything downstream relies on it)
6. CSP meta + smoke assertions (validates Task 5 didn't regress)
7. Mobile layout (clean addition on a hardened base)

---

## Task 1: Pin npm dependencies and commit lockfile

**Files:**
- Modify: `package.json`
- Create: `package-lock.json` (commit it)

- [ ] **Step 1: Inspect current versions**

Run: `npm install --package-lock-only`
Then: `cat package-lock.json | grep -A1 '"esbuild"\|"vitest"' | head -20`

Capture the resolved exact versions (e.g. `0.20.2`, `1.6.1`).

- [ ] **Step 2: Replace `^` / `~` with exact pins in `package.json`**

Update the `devDependencies` block to use the exact versions captured above:

```json
"devDependencies": {
  "esbuild": "0.20.2",
  "vitest": "1.6.1"
}
```

(Use whatever values `npm install --package-lock-only` produced — these are placeholders.)

- [ ] **Step 3: Reinstall to confirm pin**

Run: `rm -rf node_modules && npm install`
Expected: install succeeds with no `npm WARN` about version drift.

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: all smoke + unit tests pass (regression check).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: pin npm devDependencies to exact versions and commit lockfile"
```

---

## Task 2: BitAxe proxy hardening (loopback default + Origin allowlist)

**Files:**
- Modify: `bitaxe_api.py`
- Create: `tests/unit/origin-allowlist.test.py`
- Modify: `docs/SETUP.md`

- [ ] **Step 1: Write a failing test for the Origin check**

Create `tests/unit/origin-allowlist.test.py`:

```python
import unittest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from bitaxe_api import is_origin_allowed

class TestOriginAllowlist(unittest.TestCase):
    def test_allows_localhost(self):
        self.assertTrue(is_origin_allowed('http://localhost:3000', ['http://localhost:3000']))
    def test_allows_127_0_0_1(self):
        self.assertTrue(is_origin_allowed('http://127.0.0.1:3000', ['http://localhost:3000', 'http://127.0.0.1:3000']))
    def test_rejects_other_origin(self):
        self.assertFalse(is_origin_allowed('http://evil.example.com', ['http://localhost:3000']))
    def test_rejects_missing_origin(self):
        self.assertFalse(is_origin_allowed(None, ['http://localhost:3000']))
    def test_empty_allowlist_blocks_all(self):
        self.assertFalse(is_origin_allowed('http://localhost:3000', []))

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `python -m unittest tests.unit.origin-allowlist.test`
Expected: FAIL — `cannot import name 'is_origin_allowed'`.

(If module path syntax balks at hyphens, rename to `tests/unit/origin_allowlist_test.py` and adjust the run command.)

- [ ] **Step 3: Implement `is_origin_allowed` and the `--bind` flag in `bitaxe_api.py`**

Add at the top of `bitaxe_api.py`:

```python
import argparse
from urllib.parse import urlparse

def is_origin_allowed(origin, allowlist):
    """Return True if origin string exactly matches any entry in allowlist."""
    if not origin or not allowlist:
        return False
    return origin in allowlist
```

Modify the request handler to consult `is_origin_allowed`:

```python
class Handler(BaseHTTPRequestHandler):
    ALLOWED_ORIGINS = []  # set from CLI

    def _check_origin(self):
        origin = self.headers.get('Origin') or self.headers.get('Referer')
        # Strip path from Referer if present
        if origin:
            parsed = urlparse(origin)
            origin = f"{parsed.scheme}://{parsed.netloc}"
        if not is_origin_allowed(origin, Handler.ALLOWED_ORIGINS):
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Forbidden: origin not allowed')
            return False
        return True

    def do_GET(self):
        if not self._check_origin():
            return
        # ... existing GET logic unchanged ...
```

Replace the existing `__main__` block:

```python
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', default='127.0.0.1',
                        help='Interface to bind to (default 127.0.0.1; use 0.0.0.0 for LAN)')
    parser.add_argument('--port', type=int, default=3001)
    parser.add_argument('--allow-origin', action='append', default=[
        'http://localhost:3000', 'http://127.0.0.1:3000',
        'http://localhost:3002', 'http://127.0.0.1:3002',
    ], help='Allowed Origin/Referer (repeatable)')
    args = parser.parse_args()
    Handler.ALLOWED_ORIGINS = args.allow_origin
    server = HTTPServer((args.bind, args.port), Handler)
    print(f"BitAxe proxy listening on {args.bind}:{args.port}")
    print(f"Allowed origins: {Handler.ALLOWED_ORIGINS}")
    server.serve_forever()
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `python -m unittest tests.unit.origin_allowlist_test`
Expected: 5 tests pass.

- [ ] **Step 5: Manual verification**

Run: `python bitaxe_api.py` (in one shell)
Then in another: `curl -i http://127.0.0.1:3001/health` — expected 403 (no Origin header).
Then: `curl -i -H 'Origin: http://localhost:3000' http://127.0.0.1:3000/health` against the wrong port — expected connection refused (loopback default did not bind 0.0.0.0).

- [ ] **Step 6: Document in `docs/SETUP.md`**

Append a new section "Threat model & network exposure":

```markdown
## Threat model & network exposure

`bitaxe_api.py` defaults to binding `127.0.0.1` (loopback only). Nothing on the LAN can reach it unless you explicitly opt in.

To expose to LAN (e.g., to view the dashboard from your phone on the same wifi):

    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://<lan-ip>:3000

Notes:
- The proxy validates `Origin`/`Referer` on every request and returns 403 for anything outside the allowlist.
- The default allowlist covers `http://localhost:3000` and `http://127.0.0.1:3000`. Add your LAN URL only when you need it.
- This is not authentication. Anyone on your LAN who can spoof the `Origin` header (trivial with `curl`) can reach the proxy. Treat your LAN as trusted, or run a reverse proxy with HTTP basic auth in front.
```

- [ ] **Step 7: Commit**

```bash
git add bitaxe_api.py tests/unit/origin_allowlist_test.py docs/SETUP.md
git commit -m "feat(bitaxe): default to loopback, add --bind flag and Origin allowlist"
```

---

## Task 3: Secret hygiene audit + pre-commit grep

**Files:**
- Create: `scripts/check-secrets.cjs`
- Modify: `package.json` (add `npm run check:secrets`)
- Verify: `src/config.js` (no real IPs/lat-lng — likely already clean per spec)

- [ ] **Step 1: Write the secrets-check script**

Create `scripts/check-secrets.cjs`:

```js
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

// Files to skip
const SKIP = [/node_modules\//, /\.git\//, /package-lock\.json$/, /docs\//, /tests\//, /scripts\/check-secrets\.cjs$/];

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
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"check:secrets": "node scripts/check-secrets.cjs"
```

- [ ] **Step 3: Run a baseline scan**

Run: `git add -A && npm run check:secrets`
Expected: passes — confirms `src/config.js` was already cleaned per PR #7.

If it fails: replace the offending values with placeholder defaults (`192.168.0.0` → `0.0.0.0`, real lat/lng → `0`) and document via `localStorage` in the panel.

- [ ] **Step 4: Wire to pre-commit**

If `.husky/` exists, append to `.husky/pre-commit`:

```sh
npm run check:secrets
```

If not (this repo doesn't show husky in package.json), document a manual pattern in `docs/SETUP.md` and rely on CI later. For now create `.git/hooks/pre-commit` locally:

```sh
#!/bin/sh
npm run check:secrets || exit 1
```

Run: `chmod +x .git/hooks/pre-commit` (skip on Windows; the hook still runs via Git for Windows shell).

- [ ] **Step 5: Commit**

```bash
git add scripts/check-secrets.cjs package.json
git commit -m "chore: add secrets-check script for staged files"
```

---

## Task 4: Vendor React + ReactDOM with manifest + verify script

**Files:**
- Create: `src/vendor/react.production.min.js`
- Create: `src/vendor/react-dom.production.min.js`
- Create: `src/vendor/MANIFEST.md`
- Create: `scripts/verify-vendor.cjs`
- Modify: `package.json` (add `npm run verify:vendor`)
- Modify: `scripts/smoke-build.cjs` (assert vendor presence)

- [ ] **Step 1: Identify the React version currently loaded from CDN**

Run: `grep -n 'react' src/index.html`
Capture the URL and version (likely `https://unpkg.com/react@18.x.y/umd/react.production.min.js`).

- [ ] **Step 2: Download the vendored files and record SHA-384**

Run (PowerShell, adjust versions to whatever was captured in Step 1):

```powershell
mkdir src\vendor -Force
curl -L -o src\vendor\react.production.min.js https://unpkg.com/react@18.3.1/umd/react.production.min.js
curl -L -o src\vendor\react-dom.production.min.js https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js

Get-FileHash -Algorithm SHA384 src\vendor\react.production.min.js
Get-FileHash -Algorithm SHA384 src\vendor\react-dom.production.min.js
```

Capture the SHA-384 hashes printed.

- [ ] **Step 3: Write the manifest**

Create `src/vendor/MANIFEST.md`:

```markdown
# Vendored Library Manifest

| File | Version | Source | SHA-384 | Retrieved |
|------|---------|--------|---------|-----------|
| react.production.min.js | 18.3.1 | https://unpkg.com/react@18.3.1/umd/react.production.min.js | <hash-from-step-2> | 2026-05-07 |
| react-dom.production.min.js | 18.3.1 | https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js | <hash-from-step-2> | 2026-05-07 |

Update procedure:
1. Re-download from the URL above to a temp file.
2. Compute SHA-384.
3. If the upstream library has been audited and changes are deliberate, update the file and the row above in the same commit.
4. Run `npm run verify:vendor` to confirm.
```

Replace the `<hash-from-step-2>` placeholders with the actual hashes.

- [ ] **Step 4: Write the verify script**

Create `scripts/verify-vendor.cjs`:

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const manifestPath = path.join(__dirname, '..', 'src', 'vendor', 'MANIFEST.md');
const manifest = fs.readFileSync(manifestPath, 'utf8');

// Parse table rows: | filename | version | source | sha384 | date |
const rows = manifest
  .split('\n')
  .filter(l => l.startsWith('|') && !l.includes('---') && !l.match(/\|\s*File\s*\|/i))
  .map(l => l.split('|').map(c => c.trim()).filter(Boolean));

let failed = false;
for (const [file, version, , expected] of rows) {
  if (!file.endsWith('.js')) continue;
  const fullPath = path.join(__dirname, '..', 'src', 'vendor', file);
  if (!fs.existsSync(fullPath)) {
    console.error(`✗ missing: ${file}`);
    failed = true;
    continue;
  }
  const actual = crypto.createHash('sha384').update(fs.readFileSync(fullPath)).digest('base64');
  const expectedClean = expected.replace(/^sha384[-:]/i, '').trim();
  if (actual !== expectedClean && actual !== `sha384-${expectedClean}`) {
    console.error(`✗ ${file} hash mismatch:\n  expected ${expectedClean}\n  actual   ${actual}`);
    failed = true;
  } else {
    console.log(`✓ ${file} (${version})`);
  }
}

if (failed) process.exit(1);
console.log('All vendored files verified.');
```

(Note: PowerShell's `Get-FileHash` returns hex; `crypto.createHash` defaults to base64 above. Adjust whichever side to match — easiest is to standardize on hex by changing `.digest('base64')` to `.digest('hex')`.)

- [ ] **Step 5: Add npm script**

In `package.json`, add to `scripts`:

```json
"verify:vendor": "node scripts/verify-vendor.cjs"
```

- [ ] **Step 6: Run verify**

Run: `npm run verify:vendor`
Expected: `✓ react.production.min.js (18.3.1)` etc., exit 0.

- [ ] **Step 7: Extend smoke test**

Modify `scripts/smoke-build.cjs` — add to its assertions block (search for the existing required-markers list and append):

```js
// Vendored React must be inlined or linked
if (!/React\.createElement|React=/.test(html) && !/src\/vendor\/react/.test(html)) {
  fail('Vendored React not present in output');
}
```

(Final form depends on whether build inlines or links — Task 5 settles that. For now this assertion accepts either.)

- [ ] **Step 8: Commit**

```bash
git add src/vendor scripts/verify-vendor.cjs package.json scripts/smoke-build.cjs
git commit -m "feat: vendor React 18 UMD with SHA-384 manifest and verify script"
```

---

## Task 5: Build pipeline — esbuild JSX transform, drop Babel runtime

**Files:**
- Modify: `build.js`
- Modify: `src/index.html`
- Modify: `scripts/smoke-build.cjs`

This is the highest-risk task. Read `build.js` and `src/index.html` end-to-end before starting. Verify locally after every step — a regression here means a blank page.

- [ ] **Step 1: Inspect the current `<script>` tags in `src/index.html`**

Run: `grep -n 'script\|babel\|react\|MODULES' src/index.html`

You should see (current shape, paraphrased):
- `<script src="https://unpkg.com/react@.../react.production.min.js"></script>`
- `<script src="https://unpkg.com/react-dom@.../react-dom.production.min.js"></script>`
- `<script src="https://unpkg.com/@babel/standalone/.../babel.min.js"></script>`
- `<script type="text/babel">/* MODULES CONCATENATED BY build.js */</script>`

Note exact line numbers — Step 4 will modify them.

- [ ] **Step 2: Update `build.js` to esbuild-transform each `.jsx` file before concatenation**

Replace lines 47–79 of `build.js` (the `files.forEach` block) with:

```js
let concatenated = '';
for (const file of files) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Warning: File not found: ${file}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf-8');

  // Remove CommonJS wrapper (only for Node testing)
  content = content.replace(
    /if \(typeof module !== 'undefined' && module\.exports\)[\s\S]*?\}\s*$/m,
    ''
  );

  // Strip ESM imports/exports (still needed; we keep the concatenation model)
  content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/import\s+\w+\s+from\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/import\s+['"][^'"]*['"]\s*;?\n?/g, '');
  content = content.replace(/export\s+default\s+\w+\s*;?\n?/g, '');
  content = content.replace(/export\s+async\s+/g, 'async ');
  content = content.replace(/export\s+(function|const|let|var|class)\s+/g, '$1 ');
  content = content.replace(/export\s+\{[^}]*\}\s*;?\n?/g, '');

  // Build-time JSX transform for .jsx files
  if (file.endsWith('.jsx')) {
    const result = esbuild.transformSync(content, {
      loader: 'jsx',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2018',
    });
    content = result.code;
  }

  concatenated += '\n' + content;
}
```

- [ ] **Step 3: Inline vendored React + ReactDOM into the output HTML**

Append before the `replace` call in `build.js`:

```js
// Inline vendored runtime libraries
const reactSrc    = fs.readFileSync(path.join(srcDir, 'vendor', 'react.production.min.js'), 'utf8');
const reactDomSrc = fs.readFileSync(path.join(srcDir, 'vendor', 'react-dom.production.min.js'), 'utf8');
const vendorBlock = `<script>${reactSrc}</script>\n<script>${reactDomSrc}</script>`;
```

Then change the template substitution:

```js
const htmlWithCode = baseTemplate
  .replace('<!-- VENDOR -->', () => vendorBlock)
  .replace('/* MODULES CONCATENATED BY build.js */', () => concatenated);
```

- [ ] **Step 4: Update `src/index.html`**

Remove the three CDN `<script>` tags and the `type="text/babel"` attribute. Replace the `<head>` script section with:

```html
<!-- VENDOR -->
<script>
  /* MODULES CONCATENATED BY build.js */
</script>
```

(Drop `type="text/babel"` — the script is now plain JS.)

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: `✓ Built index.html`. No errors.

- [ ] **Step 6: Open `index.html` in a browser, eyeball it**

Expected: dashboard renders. Open DevTools console — expected zero errors. Confirm no network request to `unpkg.com` in the Network tab.

- [ ] **Step 7: Update smoke test assertions**

In `scripts/smoke-build.cjs`, add:

```js
// No Babel runtime, no CDN-loaded scripts for code
if (/text\/babel/.test(html))           fail('text/babel script type still present');
if (/babel\.min\.js/.test(html))        fail('babel.min.js reference still present');
if (/unpkg\.com\/react/.test(html))     fail('unpkg React reference still present');
if (/unpkg\.com\/react-dom/.test(html)) fail('unpkg ReactDOM reference still present');

// Vendored React must be present
if (!html.includes('React.createElement'))
  fail('React runtime not present in output');
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: smoke + unit pass.

- [ ] **Step 9: Commit**

```bash
git add build.js src/index.html scripts/smoke-build.cjs
git commit -m "feat(build): esbuild JSX transform, drop Babel runtime, inline vendored React"
```

---

## Task 6: CSP meta + smoke assertions

**Files:**
- Modify: `src/index.html`
- Modify: `scripts/smoke-build.cjs`

- [ ] **Step 1: Add the CSP meta tag**

In `src/index.html`, add inside `<head>` (after `<meta charset>`):

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self'
    https://api.kraken.com
    https://api.coingecko.com
    https://mempool.space
    https://api.open-meteo.com
    https://api.rss2json.com
    http://localhost:3001 http://127.0.0.1:3001
    http://localhost:3002 http://127.0.0.1:3002;
  frame-ancestors 'none';
">
```

(Single-line equivalent for browsers that don't fold whitespace — most do; if a browser balks, collapse to one line.)

Add a comment above explaining the `unsafe-inline` allowances:

```html
<!-- CSP notes:
     - 'unsafe-inline' for script-src is required while build.js inlines the bundled app block.
       Could be removed by switching to nonces in a future change.
     - 'unsafe-inline' for style-src is required because every component uses inline style props.
       Removing this would require a styling refactor (out of scope).
     - connect-src 3002 is reserved for the Phase 2 history sidecar.
-->
```

- [ ] **Step 2: Add smoke assertions**

In `scripts/smoke-build.cjs`:

```js
if (!/Content-Security-Policy/.test(html)) fail('CSP meta tag missing');
['api.kraken.com','mempool.space','api.open-meteo.com','api.rss2json.com'].forEach(host => {
  if (!html.includes(host)) fail(`CSP missing host ${host}`);
});
if (!/127\.0\.0\.1:3001/.test(html)) fail('CSP missing BitAxe loopback');
```

- [ ] **Step 3: Build and load in a browser**

Run: `npm run build && python -m http.server 3000`
Open `http://localhost:3000/index.html`. Open DevTools console.
Expected: zero CSP violation messages. All panels populate.

If a violation appears, the offending host needs to be added to `connect-src` (or a refactor is needed for an `eval`/inline-style edge case). Note the violation, fix the policy, rebuild.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.html scripts/smoke-build.cjs
git commit -m "feat(security): add CSP meta tag with documented allowlist"
```

---

## Task 7: Mobile layout — `useViewportMode` hook + `MobileLayout` component

**Files:**
- Create: `src/hooks/useViewportMode.js`
- Create: `tests/unit/useViewportMode.test.js`
- Create: `src/components/MobileLayout.jsx`
- Modify: `src/App.jsx`
- Modify: `build.js` (add new files to the `files` array)

- [ ] **Step 1: Write a failing test for `useViewportMode`**

Create `tests/unit/useViewportMode.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewportMode } from '../../src/hooks/useViewportMode.js';

describe('useViewportMode', () => {
  let originalInnerWidth;
  beforeEach(() => { originalInnerWidth = window.innerWidth; });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
  });

  function setWidth(w) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    window.dispatchEvent(new Event('resize'));
  }

  it('returns desktop above the breakpoint', () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('desktop');
  });

  it('returns mobile at and below 600px', () => {
    setWidth(390);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('mobile');
  });

  it('updates on resize', () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('desktop');
    act(() => setWidth(390));
    expect(result.current).toBe('mobile');
  });
});
```

- [ ] **Step 2: Add `@testing-library/react` and `jsdom` as exact-pinned dev deps**

Run: `npm install --save-dev --save-exact @testing-library/react@16.0.1 jsdom@24.1.0`

(Use whatever current latest exact versions resolve to; capture and pin.)

Add to `vitest.config.js` (create if absent):

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom' },
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npm run test:unit -- useViewportMode`
Expected: FAIL — `Cannot find module '.../useViewportMode.js'`.

- [ ] **Step 4: Implement the hook**

Create `src/hooks/useViewportMode.js`:

```js
function useViewportMode(breakpoint = 600) {
  const [mode, setMode] = React.useState(
    typeof window !== 'undefined' && window.innerWidth <= breakpoint ? 'mobile' : 'desktop'
  );
  React.useEffect(() => {
    const onResize = () => {
      setMode(window.innerWidth <= breakpoint ? 'mobile' : 'desktop');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return mode;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useViewportMode };
}
```

(Test file uses an import; build.js strips imports. The Vitest test imports against the source file directly. The CJS wrapper at the bottom is what makes the file importable in Node — same pattern as `formatting.js` per the existing project.)

- [ ] **Step 5: Run the test, confirm it passes**

Run: `npm run test:unit -- useViewportMode`
Expected: 3 tests pass.

- [ ] **Step 6: Build the `MobileLayout` component**

Create `src/components/MobileLayout.jsx`:

```jsx
function MobileLayout({ btc, chain, miners, weather, news, onToggleDark, dark }) {
  const T = useT();
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: T.paper,
      color: T.ink,
      fontFamily: T.body,
      padding: '12px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontFamily: T.display }}>The Daily Node</h1>
        <button onClick={onToggleDark} style={{
          minWidth: 44, minHeight: 44, background: 'transparent',
          color: T.ink, border: `1px solid ${T.ink3}`, borderRadius: 4,
        }}>{dark ? '☀' : '☾'}</button>
      </header>

      <section style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{fmtPrice(btc.data?.price)}</div>
        <div style={{ fontSize: 14, color: btc.data?.changePct >= 0 ? T.green : T.red }}>
          {fmtPct(btc.data?.changePct)}
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8 }}>
        <Kicker>Chain</Kicker>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>Block: {chain.data?.height}</div>
          <div>Hashrate: {fmtHashrate(chain.data?.hashrate)}</div>
          <div>Fees: {chain.data?.fastFee} sat/vB</div>
          <div>Mempool: {fmtBytes(chain.data?.mempoolBytes)}</div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8 }}>
        <Kicker>Miners</Kicker>
        {miners.data?.length
          ? miners.data.map(m => (
              <div key={m.ip} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{m.hostname || m.ip}</span>
                <span>{fmtHashrate(m.hashrate)}</span>
              </div>
            ))
          : <div style={{ color: T.ink2 }}>No miners reachable</div>
        }
      </section>

      <section style={{ borderTop: `1px solid ${T.ink3}`, paddingTop: 8 }}>
        <Kicker>Headlines</Kicker>
        {(news.data || []).slice(0, 5).map((n, i) => (
          <a key={i} href={n.link} style={{
            display: 'block', padding: '8px 0',
            color: T.ink, textDecoration: 'none',
            borderBottom: `1px solid ${T.ink3}`, minHeight: 44,
          }}>{n.title}</a>
        ))}
      </section>
    </div>
  );
}
```

(`fmtPrice`, `fmtPct`, `fmtHashrate`, `fmtBytes`, `Kicker`, `useT` are already in scope after concatenation. If `fmtBytes` doesn't exist yet, use the existing `fmtMempool` helper or add a one-liner near other formatters.)

- [ ] **Step 7: Wire it into `App.jsx`**

Modify `src/App.jsx`. Find the place that returns `<CommandCenter ...>` and wrap it:

```jsx
const mode = useViewportMode();
return (
  <ThemeCtx.Provider value={dark ? DARK : LIGHT}>
    {mode === 'mobile'
      ? <MobileLayout
          btc={btc} chain={chain} miners={miners}
          weather={weather} news={news}
          onToggleDark={toggleDark} dark={dark}
        />
      : <CommandCenter
          /* existing props unchanged */
        />
    }
  </ThemeCtx.Provider>
);
```

- [ ] **Step 8: Add new files to `build.js` `files` array**

Modify `build.js` — add to the `files` array at the appropriate position (hooks before components, components before App):

```js
// ... existing entries ...
'hooks/useViewportMode.js',
// ... after other components, before App.jsx:
'components/MobileLayout.jsx',
```

(Order: insert `useViewportMode.js` adjacent to `useLayoutSize.js`. Insert `MobileLayout.jsx` immediately before `CommandCenter.jsx`.)

- [ ] **Step 9: Build and verify**

Run: `npm run build`
Expected: `✓ Built index.html`.

Open `index.html` in a browser at 1920×1080 — desktop view as before.
Open DevTools, toggle device emulation to iPhone 14 (390×844). Reload. Expected: stacked single-column mobile view.

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/hooks/useViewportMode.js src/components/MobileLayout.jsx src/App.jsx build.js tests/unit/useViewportMode.test.js vitest.config.js package.json package-lock.json
git commit -m "feat(mobile): useViewportMode hook + MobileLayout for ≤600px viewports"
```

---

## Final verification

- [ ] **Run the full test suite one more time**

Run: `npm test && npm run verify:vendor && npm run check:secrets`
Expected: all green.

- [ ] **Open the built HTML at desktop and mobile sizes**

Confirm both layouts work, no CSP violations, no network requests to `unpkg.com`.

- [ ] **Tag a release**

```bash
git tag v2.0.0-phase1
git log --oneline | head -10
```

- [ ] **Update `CLAUDE.md`** to reflect:
- Babel runtime is gone; build-time JSX via esbuild
- Default-only import rule still applies (regex strip is still in place)
- BitAxe proxy default is `127.0.0.1`
- New `MobileLayout` path for small viewports
- New scripts: `verify:vendor`, `check:secrets`

Commit the doc update:

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v2 Phase 1 changes"
```
