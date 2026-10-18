# Security Policy

## Reporting a Vulnerability

If you find a security issue, **do not open a public GitHub Issue.** Instead, email the maintainer directly:

📧 **dailynode.usher252@passmail.com**

I'll acknowledge within a few days when possible. This is a personal project — no SLA.

## Scope

The Daily Node is a static, client-side dashboard. It:

- Handles no authentication, no payment, no PII.
- Stores user preferences in browser `localStorage` only.
- Makes outbound API calls (Kraken, Mempool.space, CoinGecko, Open-Meteo, RSS2JSON) and an optional local BitAxe API. `bitaxe_api.py` itself fetches news feeds for `/api/rss`, but only the fixed URLs in its `RSS_FEEDS` map: the caller names a feed by key and never supplies a URL.
- `bitaxe_api.py` also calls GitHub itself: `https://api.github.com/repos/bitaxeorg/ESP-Miner/releases/latest`, a fixed URL with no caller input, at most once per 6h (once per 15m while lookups fail), to serve the latest firmware tag at `/api/firmware`.

The most security-relevant surface is the **BitAxe API URL** in user settings — visitors can change this in their own browser. If you find a way for that input to escape the local browser context (e.g. XSS via API response, code injection via config), please report it.
