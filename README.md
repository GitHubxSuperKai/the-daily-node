# The Daily Node

> A single-file React dashboard for Bitcoin price, news, weather, and BitAxe mining stats. Designed for a 1920×1080 wall display.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/GitHubxSuperKai/the-daily-node)](https://github.com/GitHubxSuperKai/the-daily-node/releases)
[![Last commit](https://img.shields.io/github/last-commit/GitHubxSuperKai/the-daily-node)](https://github.com/GitHubxSuperKai/the-daily-node/commits/main)

**[🔗 Live demo](https://GitHubxSuperKai.github.io/the-daily-node/)** · **[📊 Pitch deck](https://GitHubxSuperKai.github.io/the-daily-node/pitch-deck.html)**

![Light mode](docs/screenshots/dashboard-light.png)
![Dark mode](docs/screenshots/dashboard-dark.png)

## What it is

A self-contained HTML dashboard that pulls live data from public APIs (Kraken, Mempool.space, CoinGecko, Open-Meteo, RSS feeds) and an optional local BitAxe miner API. Everything ships in a single `Command Center.html` file — no server, no database, no build step at runtime. Open it in a browser and it works.

Built as a personal "field report" for a wall-mounted monitor. The layout is locked to 1920×1080 and scales to fit the browser window.

## Features

- 📈 **BTC price + 24h chart** — Kraken (live) + CoinGecko (history)
- 📰 **Bitcoin news feed** — aggregated from Bitcoin Magazine, CoinDesk, news.bitcoin.com
- ⛓️ **Chain stats** — block height, hashrate, fees, difficulty + adjustment countdown (via Mempool.space)
- ⛏️ **BitAxe fleet monitoring** — live hashrate, power, temps from your local miners
- 🌤️ **Weather widget** — Open-Meteo, with auto dark mode at sunset
- 🌗 **Light + dark themes** — toggle manually or follow sunset
- ⚙️ **In-app settings** — change location, time format, units, API URLs without touching code
- 💾 **No backend** — preferences stored in browser localStorage

## Quickstart

```bash
git clone https://github.com/GitHubxSuperKai/the-daily-node.git
cd the-daily-node
npm install
npm run build
npm run dev
```

Then open <http://localhost:3000/Command%20Center.html>.

Don't have Python? Use the included Node static server instead:

```bash
node server.js
```

## Configuration

All knobs live in [`src/config.js`](src/config.js): API endpoints, polling intervals, feed list, default location.

Per-user preferences (location, time format, temp unit, BitAxe API URL, dark mode) are configurable via the in-app settings panel (⚙ icon in the top-right) and persist to browser `localStorage`.

## BitAxe setup

The Miners card polls a local BitAxe HTTP API. Two options:

1. **Use the included Python aggregator** — [`bitaxe_api.py`](bitaxe_api.py) polls multiple BitAxe IPs and serves a unified JSON endpoint. Run `BITAXE_IPS=10.0.0.5,10.0.0.6 python bitaxe_api.py`.
2. **Point the dashboard at your own miner** — open the settings panel and change the BitAxe API URL to your miner's address.

If no BitAxe is reachable, the Miners card shows a friendly placeholder.

## Architecture

Custom React hooks (`useBTC`, `useChain`, `useBitaxe`, `useWeather`, `useRSS`, `useFeedHealth`) fetch from external APIs and feed the presentational component tree. Build step (`build.js`) concatenates `src/` modules and inlines them in `src/index.html` to produce the single-file `Command Center.html`. Babel transpiles JSX in the browser at runtime.

Full breakdown in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Setup and deployment details in [`docs/SETUP.md`](docs/SETUP.md).

## Contributing

This is a personal project. Bug reports and feature requests are welcome via Issues. Pull requests are welcome but not guaranteed to be merged — please open an issue first to discuss. Forks are always welcome.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) © 2026 SuperKai
