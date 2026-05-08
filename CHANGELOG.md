# Changelog

All notable changes to The Daily Node are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GitHubxSuperKai/the-daily-node/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/GitHubxSuperKai/the-daily-node/releases/tag/v1.0.0
