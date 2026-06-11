# Batch 2 — Security Fixes Design

## Overview

Two confirmed vulnerabilities in The Daily Node. Both are exploitable only via malicious
third-party data (RSS feed items / upstream proxy destinations), not via direct user input.
Fix severity: HIGH.

---

## Vulnerability 1 — XSS via javascript: URLs in RSS links

### Problem

`src/hooks/useRSS.js` stores `link: it.link` verbatim from RSS2JSON responses. Three render
sites pass this value directly into `href`:

- `src/components/NewsColumn.jsx:46` — `href={it.link}`
- `src/components/mobile/NewsPanel.jsx:45` — `href={lead.link}`
- `src/components/mobile/NewsPanel.jsx:86` — `href={it.link}`

React safely escapes content but does **not** block `javascript:` scheme in `href`. A
compromised or malicious RSS feed can inject `javascript:alert(document.cookie)` as a story
link; clicking it executes arbitrary JavaScript in the dashboard's origin.

### Fix

Add `safeUrl(url)` to `src/utils/formatting.js`. The function:

- Returns the input URL unchanged if the scheme is `http:` or `https:` (case-insensitive)
- Returns `null` for any other scheme (`javascript:`, `data:`, `vbscript:`, blank, etc.)

Apply at the data layer in `useRSS.js` when building each item. The render sites receive
`null` for unsafe links and either omit the `href` or fall back to `'#'` (current behavior
for missing links is already handled — no render-site changes needed).

**Chosen location:** `src/utils/formatting.js` — co-located with all other sanitization
utilities (`fmtPrice`, `classifyTopic`, etc.). Applied once at the data layer, not three
times at render sites (DRY).

### Scope

- **Modify:** `src/utils/formatting.js` (add `safeUrl`), `src/hooks/useRSS.js` (apply it)
- **Test:** `tests/unit/useRSS.test.js` (confirm javascript: → null, http: passes)
- **No render-site changes** — null links already render harmlessly

---

## Vulnerability 2 — SSRF via DNS rebinding in mempool proxy

### Problem

`bitaxe_api.py` lines 232–239 validate the proxy `base` URL to block loopback/link-local
destinations. For bare IP addresses, `ipaddress.ip_address()` succeeds and the check runs.
For **hostnames** (e.g. `evil.attacker.com`), it raises `ValueError` and the `except` block
is `pass` — skipping all validation:

```python
try:
    ip = ipaddress.ip_address(base_parsed.hostname or '')
    if ip.is_loopback or ip.is_link_local:
        self._json(400, {'error': 'loopback/link-local destinations not allowed'})
        return
except ValueError:
    pass  # hostname — attacker can resolve this to 127.0.0.1 at request time
```

A DNS rebinding attack: attacker registers `evil.com` pointing to `127.0.0.1`. The proxy
fetches `http://evil.com/api/mempool-proxy?path=/api/v1/blocks` → resolves to loopback →
accesses internal services. Even without rebinding, any hostname bypasses the IP check.

### Fix

Add an allowlist of trusted hostnames at module level:

```python
ALLOWED_PROXY_HOSTS = frozenset({'mempool.space'})
```

Change the `except ValueError:` block from `pass` to an allowlist check:

```python
except ValueError:
    if base_parsed.hostname not in ALLOWED_PROXY_HOSTS:
        self._json(400, {'error': 'hostname-based proxy URLs must use an allowed host'})
        return
```

Bare IPs still go through the loopback/link-local check as before. Hostnames now require
explicit allowlist membership. `mempool.space` is the only valid destination (used by
MempoolWidget). Start9 self-hosted nodes use bare IPs (already validated).

### Scope

- **Modify:** `bitaxe_api.py` (add `ALLOWED_PROXY_HOSTS`, change `except ValueError`)
- **Test:** `tests/test_mempool_proxy.py` (hostname not in allowlist → 400; `mempool.space` passes)

---

## What was NOT found

- **Prototype pollution:** External JSON is field-extracted by key (`data.get('bitaxe_ips')`,
  `it.link`, etc.) — never spread/merged into an existing object. Not present.
- **URL validation gaps:** Frontend uses CSS Transform-only for display; `config.js` values
  are developer-controlled constants, not user input. Backend `validate_ips()` is correctly
  restrictive. Not present.

---

## Architecture

No new files. Two targeted edits plus tests.

```
src/utils/formatting.js   — add safeUrl() export
src/hooks/useRSS.js       — apply safeUrl() to link fields
bitaxe_api.py             — add ALLOWED_PROXY_HOSTS, fix except ValueError block
tests/unit/useRSS.test.js — test safeUrl behavior via useRSS
tests/test_mempool_proxy.py — test hostname validation
```

## Test Strategy

- `safeUrl` unit behavior covered via `useRSS.test.js` (mock RSS2JSON response with
  `javascript:` URL, assert resulting item has `link: null`)
- Python proxy allowlist tested in `tests/test_mempool_proxy.py` using an inline
  `BitaxeAPIHandler` request simulation (same pattern as existing Python tests)
- Full suite (`npm test` = 234 JS unit + 30 Python + smoke) must pass after all changes

## Non-Goals

- No render-site `href` changes (null already renders as omitted or `#`)
- No additional proxy destinations in allowlist (Start9 nodes use bare IPs, which pass the
  existing IP validation)
- No changes to CORS, SSL, or other proxy behavior
