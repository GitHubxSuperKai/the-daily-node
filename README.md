# The Daily Node

> A single-file React dashboard for Bitcoin price, news, weather, and BitAxe mining stats. Designed for a 1920×1080 wall display.

[![Build](https://github.com/GitHubxSuperKai/the-daily-node/actions/workflows/build.yml/badge.svg)](https://github.com/GitHubxSuperKai/the-daily-node/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/GitHubxSuperKai/the-daily-node)](https://github.com/GitHubxSuperKai/the-daily-node/releases)
[![Last commit](https://img.shields.io/github/last-commit/GitHubxSuperKai/the-daily-node)](https://github.com/GitHubxSuperKai/the-daily-node/commits/main)

**[🔗 Live demo](https://GitHubxSuperKai.github.io/the-daily-node/)** · **[📊 Pitch deck](https://GitHubxSuperKai.github.io/the-daily-node/pitch-deck.html)**

> No BitAxe? The Miners card shows a friendly placeholder — all other panels (price, news, chain stats, weather) pull live data.

![Light mode](docs/screenshots/dashboard-light.png)
![Dark mode](docs/screenshots/dashboard-dark.png)

## What it is

A React dashboard that pulls live data from public APIs (Kraken, Mempool.space, CoinGecko, Open-Meteo, RSS feeds) and your local BitAxe miners. The frontend builds to a single `index.html` file with no runtime build step. A small Python proxy ([`bitaxe_api.py`](bitaxe_api.py)) serves both the dashboard and aggregates miner data into one JSON endpoint, so the browser never has to deal with cross-origin requests to your miners.

Built as a personal "field report" for a wall-mounted monitor. The layout is locked to 1920×1080 and scales to fit the browser window.

## Features

- 📈 **BTC price + 24h chart** — Kraken (live) + CoinGecko (history)
- 📰 **Bitcoin news feed** — aggregated from Bitcoin Magazine, CoinDesk, news.bitcoin.com
- ⛓️ **Chain stats** — block height, hashrate, fees, difficulty + adjustment countdown (via Mempool.space)
- ⛏️ **BitAxe fleet monitoring** — live hashrate, power, temps from your local miners
- 🌤️ **Weather widget** — Open-Meteo, with auto dark mode at sunset
- 🌗 **Light + dark themes** — toggle manually or follow sunset
- 📱 **Mobile layout** — responsive view at <900px with tab navigation, swipe gestures, and expandable weather tile
- ⚙️ **In-app settings** — add/remove miners, change location, time format, units, and alert thresholds without touching code

## Run it

Pick whichever path matches how you like to run software. All paths produce the same dashboard at `http://<host>:3001/`.

### Option A — Docker (recommended)

```bash
docker run -d \
  -p 3001:3001 \
  -e BITAXE_IPS=<miner-ip-1>,<miner-ip-2> \
  --name daily-node \
  --restart unless-stopped \
  ghcr.io/githubxsuperkai/the-daily-node:latest
```

Or with Compose — copy [`docker-compose.yml`](docker-compose.yml), edit the `BITAXE_IPS` line, then:

```bash
docker compose up -d
```

Multi-arch images are published for `linux/amd64` and `linux/arm64`. Same image runs in any LXC container that has Docker installed.

### Option B — Run from source

The repo includes a pre-built `index.html`, so no build step is required to get started. Python 3.10+ is all you need — the proxy uses the standard library only, no `pip install`.

```bash
git clone https://github.com/GitHubxSuperKai/the-daily-node.git
cd the-daily-node
python3 bitaxe_api.py --bind 0.0.0.0
```

On Windows, use `python` instead of `python3`. Open `http://localhost:3001/` — a setup page will guide you through entering your miner IPs. The dashboard loads immediately after.

> **Want to modify the source?** Run `npm install` then `npm run build` (Node 20+ required) to rebuild `index.html` from `src/`. On Windows, run those as separate commands — `&&` is not supported in PowerShell.

### Option C — Static dashboard, no miners

If you don't have a BitAxe and just want the dashboard for price / news / chain stats:

```bash
python -m http.server 3000
```

Open `http://localhost:3000/` — the Miners card will show a friendly placeholder. No Python proxy or build step needed. (Use `python3` on Linux/macOS if `python` isn't aliased.)

## Configuration

- **Miner IPs** — enter them in the browser setup page on first launch, or set `BITAXE_IPS=<ip-1>,<ip-2>` as an environment variable when starting `bitaxe_api.py` or the Docker container.
- All other knobs live in [`src/config.js`](src/config.js): API endpoints, polling intervals, feed list, default location.
- Per-user preferences (location, time format, temp unit, dark mode) are configurable via the in-app settings panel (⚙ icon in the top-right) and persist to browser `localStorage`.

## Architecture

Custom React hooks (`useBTC`, `useChain`, `useBitaxe`, `useWeather`, `useRSS`, `useFeedHealth`) fetch from external APIs and feed the presentational component tree. At ≥900px the app renders `CommandCenter` (4-column desktop layout); below that it routes to `MobileApp` (tab-based, swipe-navigable). Build step (`build.js`) uses esbuild to bundle `src/App.jsx` into a minified IIFE injected into `src/index.html`, producing the single-file `index.html`. React and ReactDOM are vendored locally — no CDN, no runtime transpiler.

Full breakdown in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Setup and deployment details in [`docs/SETUP.md`](docs/SETUP.md).

## Contributing

This is a personal project. Bug reports and feature requests are welcome via Issues. Pull requests are welcome but not guaranteed to be merged — please open an issue first to discuss. Forks are always welcome.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) © 2026 SuperKai
