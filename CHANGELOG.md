# Changelog

All notable changes to The Daily Node are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] — 2026-08-26

### Added

- Mobile feature parity with the desktop dashboard — Epoch & Halving section and eco fee and blocks-to-clear vitals on the Bitcoin tab, fleet efficiency and solo-mining odds on the Miners tab, lead-story image and snippet on the News tab, and per-miner power, uptime, and share counts in the fleet rows.
- CI gate that fails the build when the committed `index.html` differs from a fresh rebuild, so a build-affecting dependency bump can no longer merge with a stale artifact.
- CI now runs the JS smoke, unit, and vendor-integrity checks in the build job, with a 250KB byte floor on the bundle.
- Declared `engines.node` (`^22.22.2 || ^24.15.0 || >=26.0.0`) to pin the range the toolchain actually requires.

### Changed

- Mobile Bitcoin tab information architecture — removed the duplicate Chain Vitals block and retargeted the progress indicator.
- All numeric displays standardized on the monospace face with tabular numerals.
- Miner uptime renders as a duration rather than a percentage of 24h, and VR temperature averages only over miners that actually report it.
- CodeQL scanning excludes the generated build artifact; ESLint excludes `.claude/**`; `index.html` is marked generated for language statistics.
- Dependencies: ESLint 9 → 10, `eslint-plugin-react-hooks` 5 → 7, globals 15 → 17, jsdom 29 → 30, esbuild 0.28.0 → 0.28.2, vitest 4.1.7 → 4.1.11, playwright 1.60 → 1.62, plus GitHub Actions and Docker action bumps.
- Documentation corrected against the actual build: `docs/SETUP.md` no longer describes the pre-esbuild concatenation pipeline, Babel, or a CDN dependency, and the Node version requirement and `useViewportMode` hook reference are accurate.

### Fixed

- Feed health used hardcoded thresholds because `useBTC` and `useChain` did not return their intervals; they now do, so staleness is judged against the real refresh rate.
- `useResettableInterval` and `applyV2ToConfig` guard against `0`, negative, and `NaN` intervals from corrupted preferences — previously a `0ms` `setInterval` could spin the CPU.
- Dark theme persists across reloads, and the body background follows the theme.
- Hourly forecast slots are anchored to timestamps instead of wrapping on hour-of-day, fixing truncation around midnight.
- `NetworkStatusWidget` halving and reward values are gated on a `chain.data` null check; the mempool Clear badge no longer renders a stray border.
- The Masthead quote index is taken modulo the array length, so a changed quote list cannot index out of bounds.
- News components use `rss.leadStory` rather than `items[0]`; `OnThisDay` matches exactly.
- `HISTORY_BASE` derives from `window.location.hostname`, so the price-history daemon resolves for remote viewers.
- Python servers return CORS headers on error responses, not just success responses.
- Removed dead `fetchRSSFeeds` from `src/utils/api.js`.

### Security

- Mempool proxy hardened against SSRF across several vectors: gated behind a server-side outbound allowlist, constrained to an endpoint path allowlist, refusing 3xx redirects, rejecting hostname-based URLs not in `ALLOWED_PROXY_HOSTS`, and blocking link-local, IPv4-mapped IPv6, and unspecified addresses. Closes CodeQL alerts #190 (`py/full-ssrf`) and #191 (`py/partial-ssrf`).
- RSS item links and image sources are sanitized through `safeUrl()`, blocking the `javascript:` scheme.
- Prototype-pollution guard applied at each traversal step in `setV2Path`.
- CRLF stripped from CORS origin headers.
- Local environment details scrubbed from the public repository, with a pre-commit secrets guard to prevent recurrence.

## [1.3.0] — 2026-05-27

### Added

- Mobile responsive layout (`MobileApp`) at <900px breakpoint — tab navigation, swipe gestures between tabs, dedicated Miners tab, expandable weather tile with hourly forecast, min/max price labels on chart.
- Onboarding redesign: newspaper-themed `setup.html` with guided IP entry, city search for weather, skip path for users without miners, and dark-mode toggle.
- `GET /api/setup` endpoint — returns current miner IPs and configured state for the onboarding page to prefill.
- Unified `SettingsPanel` — consolidated Alerts, Feeds/Theme/Intervals, Location/Time/Temp, and Miners configuration into one overlay (replaces separate TweaksPanel and MastheadPanel).
- Mempool self-hosted proxy — configurable base URL via settings, `Promise.allSettled` resilience, staleness detection when CDN content diverges from self-hosted node.
- Source freshness indicators — tristate `StatusDot` (fresh/stale/down) with per-source age labels in the desktop System section and a Feeds tile on mobile.
- Alert system (`useAlerts`) — configurable price-threshold checks, cooldown periods, Notification API integration, and in-page toast display.
- Price history daemon (`history_daemon.py`) — SQLite-backed poller that extends the `LineChart` with multi-day historical data and a vs-yesterday delta indicator.
- Per-column `ErrorBoundary` isolation — render failures in one column degrade gracefully without blanking the full dashboard.
- Debug-gated logger utility (`src/utils/log.js`) — `console.error/warn` in hooks and boundaries route through it; suppressed in production.
- Docker: named volume for miner config persistence across container restarts; `:latest` image published on every merge to main.
- ESLint flat config (`eslint.config.mjs`) with `eslint-plugin-react-hooks`; lint runs in CI.
- Dependabot enabled for npm, Actions, pip, and Docker base images.

### Changed

- Build: replaced Babel CDN + manual concatenation with esbuild bundle; output is deterministic and minified.
- BitAxe API: IP precedence chain (CLI flag > env var > config file); private-IP validation on all inputs; CORS origin allowlist; config persisted to `bitaxe_config.json`.
- Dependencies: Node 26-alpine, Python 3.14-slim, `actions/checkout` v6, `docker/setup-buildx-action` v4, `github/codeql-action` v4.
- CodeQL scanning enabled for JavaScript and Python.

### Fixed

- Mempool proxy hardened against SSRF, oversized responses, and path traversal.
- Auto dark mode now re-evaluates only at sunset/sunrise crossings (edge-trigger), not on every weather poll.
- CSP `connect-src` allowlist extended to cover geocoding API and CoinGecko.

## [1.2.0] — 2026-05-09

### Added

- Unified `SettingsPanel` — all settings consolidated into one ⚙ overlay; replaces separate MastheadPanel and TweaksPanel.
- Miner management in-app — add, remove, and validate BitAxe IPs inline without touching config files; config persists server-side to `bitaxe_config.json`.
- Mobile layout shows "open on desktop to configure" notice when settings are unavailable.
- Docker `:latest` image publishes automatically on every merge to `main` — no manual tag needed for routine updates.

### Fixed

- CSP `connect-src` extended to include `geocoding-api.open-meteo.com` so city-name weather search works correctly.

## [1.0.0] — 2026-05-06

### Added

- Initial public release.
- Single-file React dashboard (`index.html`) bundled from modular `src/`.
- BTC price + 24h chart (Kraken + CoinGecko).
- Bitcoin news feed aggregating Bitcoin Magazine, CoinDesk, news.bitcoin.com (via RSS2JSON).
- Mempool.space integration: chain height, hashrate, fees, difficulty + adjustment countdown.
- BitAxe fleet monitoring via local HTTP API (with friendly empty-state when no API reachable).
- Open-Meteo weather widget with auto dark mode at sunset.
- Light/dark themes, configurable via settings panel.
- localStorage-backed user preferences (location, time format, temp unit, BitAxe API URL).
- Optional Python BitAxe fleet aggregator (`bitaxe_api.py`) with `BITAXE_IPS` env var support.
- Pitch deck (`pitch-deck.html`).
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`.
- GitHub Actions CI: build verification + Pages auto-deploy.
- Issue templates and PR template for structured triage.

[Unreleased]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/GitHubxSuperKai/the-daily-node/releases/tag/v1.0.0
