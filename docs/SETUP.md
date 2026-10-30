# Setup & Deployment Guide — The Daily Node

A comprehensive guide to setting up the project locally, building for release, and deploying to production.

## Local Development

### Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js 22.22+, 24.15+, or 26+** — JavaScript runtime for build tooling (see `engines` in `package.json`)
- **Python 3** — For running the local HTTP server and the BitAxe proxy (`bitaxe_api.py`)
- **Modern browser** — Chrome, Firefox, Safari, or Edge (latest versions)
- **Git** — For cloning and version control

### Get Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/GitHubxSuperKai/the-daily-node.git
   cd the-daily-node
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This installs esbuild, the build tool used to minify the release bundle.

3. **Enable the pre-commit hook:**
   ```bash
   git config core.hooksPath .githooks
   ```
   Git never installs hooks automatically, so this is required once per clone. The hook runs `npm run check:secrets`, which blocks commits containing banned patterns (private IPs and similar) in staged files. This repository is public — see `CLAUDE.md` for what must never be committed. CI runs the same scan over your PR's net diff (the `secrets` job in `.github/workflows/build.yml`). The hook is still worth enabling: it catches a leak *before* it is committed, and it catches the case CI structurally cannot — a secret added in one commit and removed in a later one nets out to nothing in the diff, yet stays in the pushed branch's history, which on a public repo remains fetchable even after a squash merge.

   **Claude Code sets this for you.** The tracked `.claude/settings.json` runs `git config core.hooksPath .githooks` at every Claude Code session start, overriding any local or global `core.hooksPath` you had set. Outside Claude Code (a plain `git clone` and commit) the step is still manual. Read the `.git/hooks/` caveat below before opening the repo in Claude Code if you rely on hooks from other tools.

   This is a narrow guard, and a green hook is not proof a commit is clean. Four things to know before relying on it — the first two are limits of the scan itself, both verified by probe:

   - **Everything is scanned except three files: the built root `index.html`, `package-lock.json`, and the scanner itself.** `docs/` and `tests/` are scanned like the rest. The one carve-out is the short `RESERVED` list in `scripts/check-secrets.cjs`: those exact literals pass under `tests/` only, because they are the subject of the tests that assert on them. Whole-match, so a value one digit off still fails, and anywhere else — `src/`, `docs/` — the reserved literals fail like any other address. `docs/` gets no exemption at all, which matters because `CLAUDE.md` names `docs/superpowers/` as this repo's historical leak vector: use placeholders there, never an example address. Still review docs changes by eye — the next limit is why.
   - **It matches shapes, not your values.** Caught: RFC1918 and CGNAT/Tailscale (`100.64.x`) IPv4, IPv6 unique-local host addresses (`fdxx:…`), hostnames ending `.local` / `.lan` / `.home.arpa` / `.internal`, user-home paths (`<drive>:\Users\<name>`, `/home/<name>`, `/Users/<name>`), private-key blocks, the GitHub (`ghp_`, `github_pat_`), Anthropic, AWS (`AKIA`) and Slack token prefixes, and non-zero `lat:`/`lng:`. *Not* caught: `127.0.0.1` and link-local (deliberately — loopback discloses nothing, and the SSRF tests use link-local), any other hostname, bare usernames, other absolute paths (`D:\...`, `/root/`), SSH key paths, other token formats, and secrets with no recognisable prefix. `CLAUDE.md` bans all of those; read your own diff for the rest.
   - **This replaces `.git/hooks/` entirely.** `core.hooksPath` is a redirect, not an overlay. Any hook installed into `.git/hooks/` by another tool (husky, an IDE, an editor plugin) will silently stop running once this is set.
   - **It only runs on branches that contain `.githooks/`.** Git skips a missing hook without any message, so a branch created before this directory existed gets no scanning even with the setting enabled. Rebase in-flight branches onto `main` after enabling. This applies to `git worktree` checkouts too — they share `.git/config`, and so inherit the setting regardless of which branch they hold.

4. **Build and start the development server:**
   ```bash
   npm run serve
   ```
   This runs `npm run build` and then launches Python's built-in HTTP server on `http://localhost:3000`.

5. **Open the dashboard:**
   Navigate to `http://localhost:3000/` in your browser.

### Development Notes

- **A build step is required.** `src/index.html` is a template containing `<!-- VENDOR -->` and `/* MODULES CONCATENATED BY build.js */` placeholders — opening it directly renders a blank page. JSX is transformed at build time by esbuild, so every source change needs `npm run build` (or `npm run serve`) before it appears in the browser.
- **Iterating:** Re-run `npm run build` after editing, then refresh. Leave `npm run dev` running in a second terminal to avoid restarting the server on each rebuild.
- **Debugging:** Use your browser's DevTools (F12) to inspect React components, network requests, and console logs. All API calls can be monitored in the Network tab.

## Building for Release

The release build process bundles all modules into a single, minified HTML file.

### Build Command

```bash
npm run build
```

This executes `build.js`, which:

1. Runs `esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, format: 'iife', minify: true })`, which resolves the full module graph from `src/App.jsx`, transforms JSX, and minifies the result
2. Inlines the vendored React and ReactDOM UMD builds from `src/vendor/` at the `<!-- VENDOR -->` placeholder in `src/index.html`
3. Prepends a small `require()` shim mapping the `react` and `react-dom/client` specifiers to the global `React` / `ReactDOM`
4. Injects the bundled IIFE at the `/* MODULES CONCATENATED BY build.js */` placeholder
5. Writes the output to `index.html`

**Output:** A single self-contained `index.html` file with the application code and React inlined. No CDN, no runtime transpiler, and no external dependencies at runtime.

### Verifying the Build

After building, test the minified version:

```bash
npm run serve
```

This runs `npm run build` followed by `npm run dev`. Visit `http://localhost:3000/` to verify the production bundle works correctly.

You can also run the automated checks:

```bash
npm test
```

## Running the BitAxe Proxy (Required for Miner Monitoring)

If you have BitAxe miners on your local network, run the included Python proxy to aggregate them into a single CORS-friendly endpoint and serve the dashboard at the same origin:

```bash
python bitaxe_api.py
```

This starts an HTTP server on port 3001 (bound to `127.0.0.1` by default) that serves the dashboard at `/` and aggregated miner stats at `/api/miners`. On first launch with no miners configured, browsing to `/` shows a setup page where you enter miner IPs; you can also add/remove miners later from the in-app Settings Panel (⚙ icon). Both paths persist to `bitaxe_config.json`.

To expose the server to other devices on your LAN (e.g. a wall display), add `--bind 0.0.0.0`.

**Requirements:**
- Python 3.10+ (standard library only — no `pip install`)
- BitAxe miners reachable on your LAN

## Running the History Daemon (Optional, for History Charts)

`history_daemon.py` records price, chain and miner history to SQLite and serves it on port 3002, which is where the dashboard looks for it (`CONFIG.HISTORY_BASE`). It ships in the Docker image but is not its default command, so run it as a second service from the same image:

```yaml
  daily-node-history:
    image: ghcr.io/githubxsuperkai/the-daily-node:latest
    command: ["python", "history_daemon.py", "--bind", "0.0.0.0",
              "--db", "/data/history.db",
              "--allow-origin", "http://<lan-host>:3001",
              "--allow-origin", "http://localhost:3001"]   # explicit origins replace the defaults
    environment:
      - PYTHONUNBUFFERED=1   # so the startup banner (incl. the origin list) reaches docker logs
    ports:
      - "3002:3002"
    volumes:
      - daily-node-config:/data
    healthcheck:
      disable: true   # the image's HEALTHCHECK probes bitaxe_api.py on 3001, which this service doesn't run
    restart: unless-stopped
```

By default the daemon only answers dashboards on `localhost`/`127.0.0.1` (ports 3000, 3001 and 3002); a browser discards history responses from any other origin. For a dashboard opened from another machine, pass `--allow-origin` with its exact origin. Unlike `bitaxe_api.py`, the daemon does not auto-allow private-IP origins, and once any `--allow-origin` is given it replaces the localhost defaults, so list every origin you open the dashboard from (a host name and an IP are different origins). Add `--bitaxe-ip <miner-ip>` once per miner to record miner history.

## Deployment

### GitHub Pages (Recommended)

Deployment is automated via GitHub Actions. Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the bundle and publishes it to GitHub Pages automatically.

1. **Enable GitHub Pages in repository settings (one-time setup):**
   - Go to **Settings** → **Pages**
   - Set **Source** to **GitHub Actions**
   - Save

2. **Push to main — deploy happens automatically:**
   ```bash
   git push origin main
   ```

3. **Access your dashboard:**
   - Dashboard: `https://GitHubxSuperKai.github.io/the-daily-node/`
   - Pitch deck: `https://GitHubxSuperKai.github.io/the-daily-node/pitch-deck.html`

### Static Hosting (Vercel, Netlify, etc.)

1. **Build locally:**
   ```bash
   npm run build
   ```

2. **Deploy the root directory:**
   - Push your repo to GitHub
   - Connect your repo to Vercel/Netlify
   - Set build command: `npm run build`
   - Set publish directory: `/` (root)

3. **Access your dashboard:**
   The `index.html` file will be served at your deployment URL.

### Self-Hosted (Python, nginx, Apache)

#### Option A: Python HTTP Server

```bash
npm run build
python -m http.server 8080
```

Visit `http://localhost:8080/`.

#### Option B: nginx

Copy `index.html` to your web root:

```bash
npm run build
sudo cp index.html /var/www/html/
```

Access at `http://yourdomain.com/`.

#### Option C: Apache

Copy the file and enable mod_rewrite (if needed):

```bash
npm run build
sudo cp index.html /var/www/html/
sudo systemctl restart apache2
```

### Configuration After Deployment

Once deployed, users can customize the dashboard via the **Settings Panel** (click the ⚙ icon in the top-right):

- **Miners:** Add, remove, or edit BitAxe miner IPs (persisted server-side to `bitaxe_config.json`)
- **Weather Location:** Change the latitude/longitude for weather forecasts
- **Time Format:** Switch between 12-hour and 24-hour time
- **Temperature Unit:** Toggle Celsius/Fahrenheit
- **Alerts:** Configure thresholds for temperature, hashrate, and feed-staleness warnings
- **Dark Mode:** Enable/disable dark theme

User preferences are saved to browser localStorage; miner IPs are saved server-side and persist across browsers and devices.

## Project Structure After Build

The repository is organized as follows:

```
the-daily-node/
├── src/                          # Source files
│   ├── index.html                # HTML template (vendor + bundle placeholders)
│   ├── App.jsx                   # Root React component
│   ├── config.js                 # Centralized configuration (API URLs, intervals)
│   ├── theme.js                  # Color themes and ThemeCtx
│   ├── components/               # Presentational React components
│   │   ├── CommandCenter.jsx     # Main layout container (4-column grid)
│   │   ├── Masthead.jsx          # Top chrome with settings toggle
│   │   ├── DesktopTicker.jsx     # Scrolling chain vitals banner
│   │   ├── MarketsColumn.jsx     # BTC price, change %, lead story
│   │   ├── LineChart.jsx         # Price chart for the selected range (SVG)
│   │   ├── NewsColumn.jsx        # Headline feed column
│   │   ├── Weather.jsx           # Weather card
│   │   ├── ChainColumn.jsx       # Mining + network stats column
│   │   ├── Miners.jsx            # BitAxe fleet status
│   │   ├── mobile/               # Separate mobile tree (900px breakpoint)
│   │   ├── settings/             # SettingsPanel sections
│   │   └── ...                   # Status lights, icons, utilities
│   ├── hooks/                    # Custom data-fetching hooks
│   │   ├── useBTC.js             # Kraken price + CoinGecko market cap
│   │   ├── useChartRange.js      # Kraken OHLC chart line per range
│   │   ├── useChain.js           # Mempool.space aggregation
│   │   ├── useBitaxe.js          # Local BitAxe API poller
│   │   ├── useWeather.js         # Open-Meteo weather
│   │   ├── useRSS.js             # News aggregation (/api/rss, RSS2JSON fallback)
│   │   ├── useClock.js           # Time formatting
│   │   └── useFeedHealth.js      # Data source status monitoring
│   └── utils/                    # Shared utilities
│       ├── api.js                # Fetch wrappers for all external APIs
│       ├── formatting.js         # Display formatting (price, hashrate, etc.)
│       └── svg.js                # SVG component factory (icons, charts)
├── index.html           # BUILT OUTPUT (single-file dashboard)
├── build.js                      # Build script (esbuild bundle + inline)
├── bitaxe_api.py                 # Python proxy: serves dashboard + aggregates BitAxe miners
├── package.json                  # npm configuration
├── package-lock.json             # Dependency lock file
├── .gitignore                    # Git ignore rules
└── docs/                         # Documentation
    ├── ARCHITECTURE.md           # System design and data flow
    └── SETUP.md                  # This file
```

### Key Files Explained

- **`index.html`** — The release artifact. Everything needed to run the dashboard is bundled here: React, all component code, styling, and data-fetching logic.
- **`build.js`** — The build script. Bundles the module graph from `src/App.jsx` with esbuild, inlines the vendored React, and writes the single-file output.
- **`src/config.js`** — Centralized configuration. Update API endpoints, polling intervals, and defaults here.
- **`src/theme.js`** — Color theme definitions. Edit to customize the light/dark color schemes.
- **`bitaxe_api.py`** — Python proxy server. Serves the dashboard at `/`, aggregates one or more BitAxe miners into `/api/miners`, and persists miner config to `bitaxe_config.json`. Required for miner monitoring (BitAxe firmware lacks CORS headers, so direct browser polling is impossible).

## Troubleshooting

### API Not Responding

**Symptom:** Data won't load (price, news, weather shows loading spinner or error state).

**Solutions:**
1. **Check the Network tab:** Open DevTools (F12) → Network tab. Look for failed requests (red, 4xx, 5xx status).
2. **Verify miner IPs:** In the Settings panel, confirm BitAxe miner IPs are correct and reachable from the host running `bitaxe_api.py`.
3. **Check CORS:** Some APIs may block requests from your domain. Check browser console for CORS errors. If present, consider using a CORS proxy or configuring your server to add CORS headers.
4. **Increase timeouts:** If APIs respond slowly, edit `src/config.js` and increase the `TIMEOUT` value (default: 5000ms).
5. **Check external service status:**
   - [Kraken API Status](https://status.kraken.com/) — BTC price
   - [Mempool.space Status](https://mempool.space/) — Chain stats
   - [CoinGecko API Status](https://www.coingecko.com/en/api) — Market cap and ATH
   - [Open-Meteo Status](https://open-meteo.com/) — Weather
   - [RSS2JSON Status](https://rss2json.com/) — News feeds

### Weather Not Showing

**Symptom:** Weather component displays "Loading..." or shows an error.

**Solutions:**
1. **Check geolocation permission:** The app requests browser geolocation. Ensure you allowed it (not blocked). Check Settings to confirm lat/lng are set.
2. **Manually set location:** Click Settings and enter custom latitude/longitude (e.g., San Francisco: 37.7749, -122.4194).
3. **Verify Open-Meteo API:** Visit https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m to test the API directly.
4. **Check browser console:** Look for any error messages related to geolocation or fetch.

### News Feed Won't Load

**Symptom:** News section empty or "Loading..." indefinitely.

**Solutions:**
1. **Check `/api/rss`:** when the dashboard is served by `bitaxe_api.py` (the Docker image does this), feeds load from its same-origin `/api/rss?feed=<key>` endpoint. A 502 there means the server could not fetch that feed upstream; the dashboard then tries RSS2JSON for that feed. The plain dev server has no `/api/rss`, so every feed goes through RSS2JSON.
2. **Verify RSS2JSON limits:** RSS2JSON (free tier) has rate limits. If you're running the app frequently, consider adding an API key in `src/config.js`:
   ```javascript
   const RSS2JSON_API_KEY = 'your_key_here';
   ```
   Sign up at [rss2json.com](https://rss2json.com/) for a free API key.

3. **Check feed URLs:** the feed list is `RSS_FEED_MAP` in `src/config.js` (RSS2JSON fallback URLs) and `RSS_FEEDS` in `bitaxe_api.py` (proxy URLs). Some feeds may be down or have changed URLs.
4. **Network tab:** Inspect `/api/rss` and RSS2JSON requests in DevTools. Look for 4xx errors (bad feed URL) or 5xx errors (service issue).
5. **CORS issues:** Some RSS feeds may block requests from browsers, which is why feeds go through `/api/rss` or RSS2JSON rather than being fetched directly.

### Dark Mode Not Working

**Symptom:** Dark mode toggle in Settings has no effect, or colors look wrong.

**Solutions:**
1. **Check browser console:** Open DevTools → Console. Look for JavaScript errors related to the theme context.
2. **Clear localStorage:** Run this in the console:
   ```javascript
   localStorage.clear();
   window.location.reload();
   ```
   This resets all settings to defaults.
3. **Verify theme files:** Ensure `src/theme.js` is not corrupted. Check that both `LIGHT` and `DARK` objects are defined.
4. **CSS-in-JS issue:** All colors are applied via inline `style` props. If a component is overriding styles, dark mode may not work. Check DevTools Styles tab.

### Performance / Slow Updates

**Symptom:** Data updates slowly, or the dashboard feels sluggish.

**Solutions:**
1. **Reduce polling frequency:** Edit `src/config.js` and increase the interval values (e.g., change `PRICE_INTERVAL` from 30000ms to 60000ms to fetch price every 60 seconds instead of 30).
2. **Disable unused hooks:** If you don't need BitAxe stats, comment out the `useBitaxe` hook in `src/App.jsx` to reduce API calls.
3. **Check browser extensions:** Ad blockers, trackers, or other extensions may interfere. Try disabling them.
4. **Monitor memory:** Open DevTools → Memory tab and take a heap snapshot. Look for memory leaks or excessive object creation.

### Build Fails

**Symptom:** Running `npm run build` produces an error.

**Solutions:**
1. **Check Node.js version:** Ensure you're running Node.js 22.22+, 24.15+, or 26+:
   ```bash
   node --version
   ```

2. **Reinstall dependencies:** Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check file permissions:** Ensure all source files are readable:
   ```bash
   chmod -R 644 src/
   ```

4. **Verify build.js:** Check that `build.js` exists and is executable. If missing, restore from git:
   ```bash
   git checkout build.js
   ```

## Threat model & network exposure

`bitaxe_api.py` defaults to binding `127.0.0.1` (loopback only). Nothing on the LAN can reach it unless you explicitly opt in.

To expose to LAN (e.g., to view the dashboard from your phone on the same wifi):

    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://<lan-ip>:3000

### Origin / CORS and private-IP trust model

The design assumption is that **the LAN is trusted** and the browser's same-origin policy is the thing being guarded: the checks stop a page on some other site from reading or changing data through the API in a visitor's browser. They do not stop a person on your network. What `bitaxe_api.py` actually does:

- **Pages are not origin-checked.** `GET /`, `/index.html`, `/setup` and `/setup.html` are served to anyone who can reach the port; after that the dashboard's API calls are same-origin.
- **Every `/api/*` request and every `OPTIONS` preflight is origin-checked** (`_check_origin`). The `Origin` header is used, falling back to `Referer`, and reduced to `scheme://host:port`. A malformed value gets `403 malformed origin`; one that fails `is_origin_allowed` gets `403 origin not allowed`.
- **The `Host` header is checked first.** An `/api/*` request whose `Host` is an IP literal or `localhost` passes; a host name passes only if it is the host of an allowlisted origin (any port). Anything else gets `403 host not allowed`. A request with no `Host` (some non-browser tools) passes.
- **No `Origin` and no `Referer` is allowed**, unless the browser marks the request `Sec-Fetch-Site: cross-site` or `same-site`, which gets `403 origin not allowed`. Non-browser tools (`curl`, the Docker healthcheck) send none of these headers. The dashboard's own same-origin requests still carry a `Referer` (and `POST`s an `Origin`) naming the dashboard's host, which is why that host must itself pass the check below. This is not authentication.
- **An origin is allowed if** it is in the allowlist, **or** its host is an IP literal that Python's `ipaddress` classes as private or loopback. That covers RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), loopback, link-local (`169.254/16`, `fe80::/10`), IPv6 unique-local (`fc00::/7`) and a few reserved ranges; it does **not** cover CGNAT / Tailscale `100.64/10`. Why: opening the dashboard as `http://<lan-ip>:3001` from a phone should work with no flags, and a page whose origin is a private IP literal is by construction served from your own network, which is already trusted. Host names (`http://<lan-host>:3001`, `*.local`) are never auto-allowed, because deciding whether a name is "private" would mean resolving it, which a DNS-rebinding page controls.
- **The allowlist** defaults to `localhost` and `127.0.0.1` on ports 3000, 3001 and 3002. Each `--allow-origin <origin>` (repeatable) must be the exact `scheme://host:port` and **replaces** the defaults rather than adding to them. Add one only when you open the dashboard by host name or a non-private IP (e.g. Tailscale `100.x`); a private LAN IP needs no flag.
- **CORS headers** echo back only the origin that passed the check (`Access-Control-Allow-Origin: <that origin>`, never `*`, with `Vary: Origin`), and requests with no origin get none. Every API response that passed the check also sends `Access-Control-Allow-Private-Network: true`, so Chrome's Private Network Access check does not block the dashboard's requests to a server on your network.
- **Miner IPs must be private or loopback** (`validate_ips`, same `ipaddress` classification) when they come from `--ips`, `BITAXE_IPS` or `POST /api/setup` (which is what writes the config file). A hand-edited config file is loaded as-is, without that check. That is the real gate on what `/api/miners` will fetch (`http://<miner-ip>/api/system/info`): the setup endpoint has no authentication, so anyone who can reach the port can rewrite the miner list, but only to LAN addresses.

So this is not authentication, and it does not make the API's data private. Anyone on your LAN can reach the API, spoof `Origin` (trivial with `curl`) and change the miner list. Treat your LAN as trusted, keep the default `127.0.0.1` bind when you don't need LAN access, or put a reverse proxy with HTTP basic auth in front. The outbound side is gated separately, not by origin: `/api/rss` only fetches the feed URLs in its server-side key allowlist, and `/api/mempool-proxy` only the destinations described below.

### Self-hosted mempool node (`/api/mempool-proxy`)

If you point the dashboard at your own mempool instance (Settings → "Self-hosted mempool node URL"), the browser can't reach it cross-origin, so requests route through the server's `/api/mempool-proxy` endpoint. To prevent this from becoming an open SSRF relay into your network, the proxy **only forwards to destinations you explicitly authorize** — every other destination returns `403`.

Authorize your node's exact base URL with `--allow-proxy` (repeatable):

    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://<lan-ip>:3000 \
        --allow-proxy https://<node-ip>:3006

Or persist it in `bitaxe_config.json`:

```json
{
  "bitaxe_ips": ["<miner-ip>"],
  "proxy_hosts": ["https://<node-ip>:3006"]
}
```

Notes:
- Match is on the exact normalized origin (`scheme://host:port`) — the port must match, and only the request's `/api/…` path varies. `--allow-proxy` overrides `proxy_hosts` when both are set.
- The forwarded path is also restricted to the exact set of mempool endpoints the dashboard uses (block, fee, mempool, and mining-pool reads); any other `/api/…` path on an authorized node returns `400`. This keeps the caller-controlled path from widening the request beyond the endpoints the dashboard needs.
- With no entries configured (the default), `/api/mempool-proxy` rejects everything. Public `mempool.space` is fetched directly by the browser and never touches this endpoint, so leaving the allowlist empty only disables *self-hosted* nodes.
- **Prefer an IP literal** (`https://<node-ip>:3006`) over a hostname. The allowlist pins the origin, but a hostname is still resolved at request time, so a DNS-rebinding attacker who controls that name could point it elsewhere after the check; an IP literal has no such window.
- **Loopback / same-host destinations are not supported.** `127.0.0.1`, link-local, and unspecified addresses are blocked by an earlier guard regardless of the allowlist, so authorizing them has no effect. Run the dashboard server and the mempool node on separate hosts, or put the node on a LAN IP.

## Support & Contributing

For issues, feature requests, or contributions, see the main repository README or contact the project maintainers.

---

**Last updated:** August 2026
