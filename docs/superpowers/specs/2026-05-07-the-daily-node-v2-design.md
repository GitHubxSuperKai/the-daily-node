# The Daily Node — v2 Design

**Date:** 2026-05-07
**Status:** Approved scope, awaiting user review of full spec
**Approach:** Harden first, then grow (Approach 1)
**Deployment target:** Single user, local workstation, LAN-only BitAxe access. Mobile-friendly secondary view.

---

## 1. Goals

- Eliminate runtime CDN dependency for code (React, ReactDOM, Babel)
- Drop Babel-in-browser; JSX transformed at build time via esbuild
- Pin and lock all dependencies (npm + vendored libs) with Subresource Integrity (SRI) hashes where any external asset remains
- Restrict the BitAxe Python proxy to loopback by default; expose to LAN only via opt-in
- Ship a 390px mobile layout that does not rely on `transform: scale()`
- Add local history (price, hashrate, fees, mempool) via a small Python sidecar + SQLite
- Browser-side threshold alerts (fees spike, block-time drift, miner offline) via the Notification API
- Tweaks panel: refresh intervals, feed toggles, alert thresholds, theme override

## 2. Non-goals

- Auth, multi-user, hosted deployment
- Public-facing demo or share links
- Cloud sync of history or settings
- Service worker / installable PWA
- Replacing `build.js` with Vite or migrating to TypeScript

## 3. Future considerations (out of scope for v2)

- **Vite + TypeScript rewrite.** Worth revisiting when: 3rd-party React libs become regular adds, a 3rd "build-regex blank-page" bug ships, or the single-file-HTML constraint stops mattering. Trade-offs analyzed during brainstorming; deferred deliberately to preserve the single-file ethos.
- **PWA / offline-first.** Once vendored assets land in v2, a service worker is a small additional step.
- **Multi-device sync of preferences and history.** Requires an auth model — out of scope while deployment stays local.

---

## 4. Phased plan

v2 ships in two phases. Phase 1 is mandatory before Phase 2 starts; Phase 2 features depend on the sidecar introduced in Phase 1.

### Phase 1 — Harden

**1.1 Build pipeline: build-time JSX**
- Add `esbuild` JSX transform step to `build.js`. Output is plain JS (no `text/babel` script type).
- Remove the `<script src=".../babel.min.js">` tag from `src/index.html`.
- Update the build-regex import-strip step to handle any new patterns esbuild emits (or, preferred: replace the regex-strip with esbuild's bundling so combined imports work).
- Smoke test (`scripts/smoke-build.cjs`) gains an assertion that no `text/babel` script tag and no raw `import`/`export` survive in output.
- Documentation: update `CLAUDE.md` "Imports: default only" gotcha — once esbuild bundles, the rule may relax. Verify before rewriting docs.

**1.2 Vendor React + ReactDOM**
- Move React 18 UMD + ReactDOM 18 UMD into `src/vendor/` checked into the repo.
- `build.js` inlines them into `Command Center.html` (or references them via relative path with SRI hashes).
- Pin exact versions in a new `vendor/MANIFEST.md` listing source URL, version, SHA-384 hash, retrieval date.
- Add a `scripts/verify-vendor.cjs` test: rehash vendor files, compare to manifest, fail if drift.

**1.3 Dependency pinning**
- `package.json`: pin all dev deps to exact versions (no `^` / `~`).
- Commit `package-lock.json` (verify present; if not, generate).
- Add `npm audit` to CI / pre-commit (advisory only, not blocking).

**1.4 BitAxe proxy hardening**
- `bitaxe_api.py` defaults to `127.0.0.1:3001` instead of `0.0.0.0:3001`.
- Add `--bind` CLI flag for opt-in LAN exposure (`--bind 0.0.0.0`).
- Add a basic `Origin` / `Referer` allowlist check (browser must be on the same host or explicitly configured origin) to prevent cross-origin abuse from another LAN device's browser.
- Document the threat model in `docs/SETUP.md`: loopback default, what LAN exposure means, how to put it behind a reverse proxy if desired.

**1.5 CSP + security headers**
- Add `<meta http-equiv="Content-Security-Policy">` to `Command Center.html`. Starting policy:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'` (inline still needed for the bundled app block; revisit after Phase 1.1)
  - `style-src 'self' 'unsafe-inline'` (every component uses inline styles by design)
  - `img-src 'self' data: https:` (RSS thumbnails come from arbitrary HTTPS origins)
  - `connect-src 'self' https://api.kraken.com https://api.coingecko.com https://mempool.space https://api.open-meteo.com https://api.rss2json.com http://localhost:3001 http://127.0.0.1:3001`
  - `frame-ancestors 'none'`
- Document the policy in a comment block at the top of `src/index.html`.
- Smoke test asserts the CSP meta tag is present and contains the expected directives.

**1.6 Mobile layout (390px)**
- New responsive mode triggered by viewport width ≤ 600px: skip `transform: scale()` entirely; render a single-column stacked layout.
- Component selection: hide the masthead chrome and ticker; show price, sparkline, lead story, top 5 headlines, BitAxe summary card, chain vitals trio.
- Touch-friendly tap targets (min 44px) for the dark-mode toggle, panel toggle.
- New util: `useViewportMode()` returns `'desktop' | 'mobile'`. Components branch on it; no per-component media queries.
- Lighthouse target: ≥ 90 on mobile performance after Phase 1.

**1.7 Secret hygiene audit**
- Confirm no real BitAxe IPs, lat/lng, or API keys remain in `config.js`, hooks, or test fixtures.
- Add a pre-commit hook (or CI grep) to flag committed values matching `192.168\.`, `10\.0\.`, lat/lng outside `[0,0]` defaults.
- Document the local-override flow (set in `localStorage` via the panel, never in committed code).

### Phase 2 — Grow

**2.1 History sidecar (Python + SQLite)**
- New `history_daemon.py` runs alongside `bitaxe_api.py`. Polls the same upstream APIs the browser already polls, writes time-series rows to `~/.daily-node/history.db`.
- Schema (one table per metric, append-only):
  - `price(ts INTEGER PK, source TEXT, usd REAL, vol REAL)`
  - `hashrate(ts, ehs REAL)`
  - `fees(ts, fast INTEGER, half INTEGER, eco INTEGER)`
  - `mempool(ts, vsize INTEGER, count INTEGER)`
  - `miners(ts, ip TEXT, hashrate REAL, temp REAL, shares INTEGER)`
- Retention: 90 days at 1-minute resolution, then aggregated to hourly.
- HTTP read API on `127.0.0.1:3002`: `/history/<metric>?from=<ts>&to=<ts>&bucket=<min|hour|day>`. JSON only. Loopback by default.
- New hook `useHistory(metric, range)` consumes it. Drives a "yesterday vs. now" delta display and a sparkline that extends the existing chart back further.

**2.2 Threshold alerts**
- Browser-side using the `Notification` API.
- Alert types: fee spike (`fastFee > userThreshold`), block time drift (>15min between blocks), miner offline (any IP unreachable for 3 polls), price move (>X% in Y minutes).
- Per-alert config: enabled, threshold, cooldown (minimum minutes between fires).
- Persistence: `localStorage` only (no server-side scheduling — dashboard must be open).
- New hook `useAlerts(triggers, config)` with a small reducer; dispatches `Notification` calls and a transient in-page toast.

**2.3 Tweaks panel**
- Existing TODO. New right-side overlay panel (analogous to MastheadPanel pattern) with sections:
  - Refresh intervals (per data source, with sensible min/max bounds)
  - Feed toggles (disable individual RSS sources, individual BitAxe miners)
  - Alert thresholds (from 2.2)
  - Theme: light / dark / auto-by-sunset
- All values persist to `localStorage` under one namespace key (`dn.prefs.v2`) with a schema version field for forward migration.

---

## 5. Architecture deltas

### Before
```
Browser ──unpkg──> React, ReactDOM, Babel (runtime transform of inline JSX)
Browser ──fetch──> Kraken / CoinGecko / mempool.space / Open-Meteo / rss2json
Browser ──fetch──> 192.168.1.59:3001 (bitaxe_api.py on 0.0.0.0)
```

### After (Phase 1)
```
build.js (esbuild JSX + bundle) ──> Command Center.html (vendored React/ReactDOM, no Babel)
Browser ──fetch──> same upstream APIs (unchanged), now CSP-restricted
Browser ──fetch──> 127.0.0.1:3001 (bitaxe_api.py, loopback default, Origin check)
```

### After (Phase 2)
```
history_daemon.py ──polls──> upstream APIs ──writes──> ~/.daily-node/history.db
Browser ──fetch──> 127.0.0.1:3002 (history read API)
Browser ──fetch──> 127.0.0.1:3001 (BitAxe, unchanged from Phase 1)
Browser ──Notification API──> OS notifications on threshold breach
```

### New / changed files (summary)

| Path | Phase | Change |
|------|-------|--------|
| `build.js` | 1.1 | Add esbuild JSX transform; remove regex import strip if possible |
| `src/index.html` | 1.1, 1.5 | Drop Babel script tag; add CSP meta |
| `src/vendor/react.production.min.js` | 1.2 | Vendored |
| `src/vendor/react-dom.production.min.js` | 1.2 | Vendored |
| `src/vendor/MANIFEST.md` | 1.2 | New — version + hashes |
| `scripts/verify-vendor.cjs` | 1.2 | New |
| `scripts/smoke-build.cjs` | 1.1, 1.5 | New assertions |
| `package.json` / `package-lock.json` | 1.3 | Pin exact versions |
| `bitaxe_api.py` | 1.4 | Default loopback, `--bind` flag, Origin check |
| `docs/SETUP.md` | 1.4 | Threat model section |
| `src/hooks/useViewportMode.js` | 1.6 | New |
| `src/components/MobileLayout.jsx` | 1.6 | New |
| `history_daemon.py` | 2.1 | New |
| `src/hooks/useHistory.js` | 2.1 | New |
| `src/hooks/useAlerts.js` | 2.2 | New |
| `src/components/TweaksPanel.jsx` | 2.3 | New |
| `CLAUDE.md` | 1.1 | Update import-rule gotcha after esbuild lands |

---

## 6. Testing strategy

- **Smoke test (existing, extended):** asserts CSP meta present, no `text/babel` script tags, no raw `import`/`export` leaked, vendored React/ReactDOM byte size within ±5% of manifest.
- **Vendor verify (new):** SHA-384 of `src/vendor/*` matches `MANIFEST.md`.
- **Unit (existing):** keep `formatting`, `scale`, `svg` tests. Add tests for `useViewportMode`, alert threshold logic (pure functions extracted from `useAlerts`), history bucket aggregation.
- **Manual checklist on each phase:**
  - Desktop 1920×1080 dashboard renders, all panels populate, dark mode toggles.
  - Mobile 390px renders, no horizontal scroll, all primary tiles legible.
  - BitAxe proxy: confirm `0.0.0.0` access fails by default, `127.0.0.1` works.
  - CSP: open DevTools console, confirm zero CSP violations on a clean load.

## 7. Rollout

- One PR per phase sub-section (1.1, 1.2, ... ) to keep diffs reviewable.
- Tag `v2.0.0` after Phase 1 ships green; tag `v2.1.0` after Phase 2.
- No backward-compat concerns (single user, no API consumers).

## 8. Risks & open questions

- **esbuild JSX transform vs. existing regex import strip** — they may collide. Phase 1.1 must decide: replace regex strip entirely with esbuild bundling (cleaner) or keep both (safer, more complexity). Decide during plan write-up by prototyping the esbuild config against the current 40-file source tree.
- **CSP `unsafe-inline` for styles** — every component uses inline `style=` props by design. Removing `unsafe-inline` would require a styling refactor (out of scope). Documented as accepted residual risk.
- **History daemon process management** — how does it start/stop? Options: manual (documented), systemd unit, Windows Task Scheduler entry. Pick one in the implementation plan based on user's OS (Windows per CLAUDE.md path conventions).
- **Mobile layout component reuse** — do mobile and desktop share components, or does mobile get its own simpler tile components? Lean toward shared components with prop-driven density.
