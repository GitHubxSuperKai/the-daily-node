# Changelog

All notable changes to The Daily Node are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-05-27

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

[Unreleased]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/GitHubxSuperKai/the-daily-node/releases/tag/v1.0.0
