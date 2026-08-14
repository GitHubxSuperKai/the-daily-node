# Batch 2 — Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two confirmed security vulnerabilities: XSS via unsanitized RSS link URLs and SSRF via DNS rebinding in the mempool proxy endpoint.

**Architecture:** Add `safeUrl()` to `src/utils/formatting.js` and apply it once at the useRSS data layer (plus the dead `fetchRSSFeeds` in api.js for consistency); no render-site changes needed. In `bitaxe_api.py`, add `ALLOWED_PROXY_HOSTS = frozenset()` as a class attribute on `BitaxeAPIHandler` and reject all hostname-based proxy URLs not in the allowlist (default: none — the proxy serves LAN IP nodes only).

**Tech Stack:** JavaScript/React (esbuild bundle, Vitest tests), Python 3 (stdlib HTTPServer, unittest)

---

## File Map

| File | Change |
|------|--------|
| `src/utils/formatting.js` | Add `safeUrl(url)` function + export it |
| `src/hooks/useRSS.js` | Import `safeUrl`; apply to `it.link` |
| `src/utils/api.js` | Apply `safeUrl` to dead `fetchRSSFeeds` mapper (one line) |
| `tests/unit/useRSS.test.js` | Add test: `javascript:` link → `null`; `https:` passes |
| `bitaxe_api.py` | Add `ALLOWED_PROXY_HOSTS = frozenset()` class attr; fix `except ValueError` |
| `tests/test_mempool_proxy.py` | Patch allowlist in base class; add `HostnameAllowlistTest` |

---

## Task 1: XSS — safeUrl() in formatting.js and useRSS.js

**Files:**
- Modify: `src/utils/formatting.js` (add function + CJS export)
- Modify: `src/hooks/useRSS.js` (import + apply)
- Test: `tests/unit/useRSS.test.js`

- [ ] **Step 1: Write the failing test**

Add a new `it` block in `tests/unit/useRSS.test.js`, after the existing `'marks err=true'` test:

```js
it('strips javascript: links — unsafe link becomes null', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'ok',
      feed: { title: 'XSSFeed' },
      items: [
        {
          title: 'Safe story',
          link: 'https://example.com/safe',
          pubDate: new Date(2026, 0, 2).toISOString(),
          description: '',
          categories: ['News'],
        },
        {
          title: 'XSS story',
          link: 'javascript:alert(document.cookie)',
          pubDate: new Date(2026, 0, 1).toISOString(),
          description: '',
          categories: ['News'],
        },
      ],
    }),
  });
  const { result } = renderHook(() => useRSS());
  await waitFor(() => expect(result.current.leadStory).not.toBeNull());

  // CONFIG.RSS_FEEDS has 3 feeds; mock returns same 2 items per feed, so
  // items contains duplicates sorted by pubDate desc. Filter by title to find
  // the XSS item regardless of its position.
  const xssItems = result.current.items.filter(i => i.hed === 'XSS story');
  expect(xssItems.length).toBeGreaterThan(0);
  xssItems.forEach(i => expect(i.link).toBeNull());

  // Safe items must keep their https: link
  const safeItems = [...(result.current.leadStory ? [result.current.leadStory] : []),
                     ...result.current.items].filter(i => i.hed === 'Safe story');
  expect(safeItems.length).toBeGreaterThan(0);
  safeItems.forEach(i => expect(i.link).toBe('https://example.com/safe'));
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/unit/useRSS.test.js --reporter=verbose
```

Expected: FAIL — the `javascript:` link is NOT yet sanitized, so `items[0].link` is `'javascript:alert(document.cookie)'` rather than `null`.

- [ ] **Step 3: Add `safeUrl` to `src/utils/formatting.js`**

Insert the function between `isFresh` (line 205) and the CJS export block (line 209):

```js
function safeUrl(url) {
  if (!url) return null;
  try {
    const scheme = new URL(url).protocol;
    return scheme === 'http:' || scheme === 'https:' ? url : null;
  } catch {
    return null;
  }
}
```

Then add `safeUrl` to the CJS `module.exports` object (the block starting at line 210):

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtNum,
    fmtPrice,
    fmtPct,
    fmtVolUsd,
    fmtBlockTime,
    fmtHashrate,
    fmtDiff,
    fmtMempoolMB,
    fmtBlockSize,
    timeAgoUnix,
    timeAgo,
    fmtHour,
    fmtHHMM,
    safeISODate,
    nextHalving,
    circulatingBTC,
    calcSoloOdds,
    wmoDesc,
    wmoIcon,
    wmoSpeed,
    fmtBestDiff,
    classifyTopic,
    isFresh,
    safeUrl,
  };
}
```

- [ ] **Step 4: Apply `safeUrl` in `src/hooks/useRSS.js`**

Update line 4 to import `safeUrl`:

```js
import { classifyTopic, timeAgo, safeUrl } from '../utils/formatting.js';
```

Update line 32 (`link: it.link`) to:

```js
          link: safeUrl(it.link),
```

Full context around the change (lines 25–37 after edit):

```js
        return j.items.map(it => ({
          cat: it.categories && it.categories[0] ? it.categories[0].toUpperCase().slice(0, 20) : 'BITCOIN',
          topic: classifyTopic(it.title),
          hed: it.title,
          src,
          pubDate: it.pubDate,
          t: timeAgo(it.pubDate),
          link: safeUrl(it.link),
          img:
            it.thumbnail ||
            (it.enclosure && it.enclosure.type && it.enclosure.type.startsWith('image/') ? it.enclosure.link : null) ||
            (it.description ? (it.description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i) || [])[1] || null : null) ||
            null,
          snippet: it.description
            ? it.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000)
            : '',
        }));
```

- [ ] **Step 5: Run the full JS test suite**

```bash
npm test
```

Expected output (all pass):
```
Test Files  N passed (N)
Tests       234+ passed (0 failed)
```

The new `'strips javascript: links'` test must be listed as PASS. Python tests run as part of `npm test` — confirm 30 pass. Smoke must pass.

If the count is 235+ that is correct (new test added).

- [ ] **Step 5b: Apply `safeUrl` to dead `fetchRSSFeeds` mapper in `src/utils/api.js`**

`fetchRSSFeeds` at line ~225 has the same `link: it.link` mapping. It has zero callers but is exported, so a future caller would reintroduce the vulnerability. Fix the one line:

Find (around line 225, inside `fetchRSSFeeds`):
```js
          link: it.link,
```
Replace with:
```js
          link: safeUrl(it.link),
```

Also add `safeUrl` to the import at the top of `api.js`. Find the existing formatting import (look for `import {` and `formatting.js`):
```js
import { classifyTopic, timeAgo } from './utils/formatting.js';
```
— or whatever the existing import looks like in api.js — and add `safeUrl` to it. If `api.js` uses `require()` or CJS, mirror the pattern.

- [ ] **Step 6: Commit**

```bash
git add src/utils/formatting.js src/hooks/useRSS.js src/utils/api.js tests/unit/useRSS.test.js
git commit -m "fix(xss): sanitize RSS item links via safeUrl() — block javascript: scheme"
```

---

## Task 2: SSRF — hostname allowlist in bitaxe_api.py

**Files:**
- Modify: `bitaxe_api.py` (add class attr + fix except block)
- Modify: `tests/test_mempool_proxy.py` (patch allowlist in base class; add HostnameAllowlistTest)

**Background:** The proxy is only ever used for self-hosted LAN nodes (Start9, Umbrel etc.). Those nodes are almost always accessed by bare LAN IP (e.g. `<lan-host>:3006`), which already passes the existing IP check. The default allowlist is therefore `frozenset()` — no hostnames allowed unless explicitly configured. The class-attribute pattern (`ALLOWED_PROXY_HOSTS`) mirrors how `ALLOWED_ORIGINS` is done, so tests can patch it to `frozenset({'localhost'})` to let the stub upstream at `127.0.0.1` work without coupling production config to test infra.

- [ ] **Step 1: Write the failing tests**

In `tests/test_mempool_proxy.py`, add a new test class **after** `UpstreamErrorTest` and **before** `if __name__ == '__main__':`:

```python
class HostnameAllowlistTest(MempoolProxyTestBase):
    """Hostname-based base URLs are rejected unless explicitly in ALLOWED_PROXY_HOSTS."""

    def test_unlisted_hostname_rejected(self):
        # evil.com is a hostname; not in the allowlist (even in tests, where
        # only 'localhost' is added for stub infrastructure)
        status, body = self._get('/api/mempool-proxy?base=http://evil.com&path=/api/v1/blocks/tip/height')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'hostname-based proxy URLs are not supported; use an IP address')

    def test_listed_hostname_allowed(self):
        # 'localhost' is added to ALLOWED_PROXY_HOSTS in MempoolProxyTestBase.setUpClass
        # (test infrastructure; production default is frozenset())
        _StubUpstream.body = b'{"height": 900000}'
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/v1/blocks/tip/height')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {'height': 900000})
        finally:
            _StubUpstream.body = b'{"ok": true}'
            _StubUpstream.status = 200
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
python -m pytest tests/test_mempool_proxy.py::HostnameAllowlistTest -v
```

Expected: FAIL — `test_unlisted_hostname_rejected` gets 200 (bug: hostname passes through), `test_listed_hostname_allowed` may pass or 400 depending on current code.

- [ ] **Step 3: Add `ALLOWED_PROXY_HOSTS` to `BitaxeAPIHandler` in `bitaxe_api.py`**

In the class definition (around line 131, after `ALLOWED_ORIGINS = []`), add the new class attribute. Default is `frozenset()` — no hostnames allowed. Administrators who genuinely need hostname-based proxy access can add entries at startup; in practice, all documented LAN node configurations (Start9, Umbrel) use bare IPs.

```python
class BitaxeAPIHandler(BaseHTTPRequestHandler):
    ALLOWED_ORIGINS = []
    ALLOWED_PROXY_HOSTS = frozenset()
    CONFIG_PATH = CONFIG_PATH  # overridden in __main__ from args.config
    _setup_page = None
    _dashboard = None
```

- [ ] **Step 4: Fix the `except ValueError` block in `bitaxe_api.py`**

Find the proxy validation block (around lines 232–239). The current code:

```python
            try:
                ip = ipaddress.ip_address(base_parsed.hostname or '')
                if ip.is_loopback or ip.is_link_local:
                    self._json(400, {'error': 'loopback/link-local destinations not allowed'})
                    return
            except ValueError:
                pass  # hostname (not a bare IP) — allow
```

Replace the `except ValueError` block:

```python
            try:
                ip = ipaddress.ip_address(base_parsed.hostname or '')
                if ip.is_loopback or ip.is_link_local:
                    self._json(400, {'error': 'loopback/link-local destinations not allowed'})
                    return
            except ValueError:
                if base_parsed.hostname not in self.ALLOWED_PROXY_HOSTS:
                    self._json(400, {'error': 'hostname-based proxy URLs are not supported; use an IP address'})
                    return
```

- [ ] **Step 5: Patch `ALLOWED_PROXY_HOSTS` in the test base class**

In `tests/test_mempool_proxy.py`, update `MempoolProxyTestBase.setUpClass` to patch `ALLOWED_PROXY_HOSTS` so `localhost` (used by the stub upstream) is allowed in tests. The updated `setUpClass` (existing lines + one new line):

```python
    @classmethod
    def setUpClass(cls):
        # Allow same-origin (no Origin header) — _check_origin returns True
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []
        # Allow 'localhost' for stub upstream; production default is frozenset()
        bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_HOSTS = frozenset({'localhost'})

        # Use port 0 — OS assigns an available port atomically, no TOCTOU race.
        cls.proxy = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        cls.proxy_port = cls.proxy.server_address[1]
        cls.upstream = HTTPServer(('127.0.0.1', 0), _StubUpstream)
        cls.upstream_port = cls.upstream.server_address[1]

        cls.proxy_thread = threading.Thread(target=cls.proxy.serve_forever, daemon=True)
        cls.upstream_thread = threading.Thread(target=cls.upstream.serve_forever, daemon=True)
        cls.proxy_thread.start()
        cls.upstream_thread.start()
```

Also update the comment in `HappyPathTest.test_proxies_upstream_body_verbatim` to reflect the new behavior (old comment described the bug; new comment should be accurate):

```python
    def test_proxies_upstream_body_verbatim(self):
        # 'localhost' is a hostname; it passes because ALLOWED_PROXY_HOSTS includes
        # 'localhost' in tests (patched in setUpClass for stub infrastructure).
        base = f'http://localhost:{self.upstream_port}'
        path = '/api/blocks/tip/height'
        status, body = self._get(f'/api/mempool-proxy?base={base}&path={path}')
        self.assertEqual(status, 200)
        self.assertEqual(body, b'{"height": 800000}')
```

- [ ] **Step 6: Run only the mempool proxy tests**

```bash
python -m pytest tests/test_mempool_proxy.py -v
```

Expected: all tests pass, including the two new `HostnameAllowlistTest` cases and all existing tests.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: 32 Python tests pass (was 30 before; 2 new tests added), 234+ JS unit tests pass, smoke passes.

- [ ] **Step 8: Commit**

```bash
git add bitaxe_api.py tests/test_mempool_proxy.py
git commit -m "fix(ssrf): block hostname-based proxy URLs not in ALLOWED_PROXY_HOSTS allowlist"
```
