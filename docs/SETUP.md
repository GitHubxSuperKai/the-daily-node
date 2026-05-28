# Setup & Deployment Guide — The Daily Node

A comprehensive guide to setting up the project locally, building for release, and deploying to production.

## Local Development

### Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js 20+** — JavaScript runtime for build tooling
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

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   This launches Python's built-in HTTP server on `http://localhost:3000`.

4. **Open the dashboard:**
   Navigate to `http://localhost:3000/src/index.html` in your browser.

### Development Notes

- **Unbuilt source:** The dev server serves the original source files directly (no bundling step). This allows you to edit JSX and see changes immediately after a browser refresh.
- **Debugging:** Use your browser's DevTools (F12) to inspect React components, network requests, and console logs. All API calls can be monitored in the Network tab.
- **Manual rebuild:** After making changes, you can run `npm run build` at any time to test the minified production bundle locally (output: `index.html`).

## Building for Release

The release build process concatenates all modules into a single, minified HTML file.

### Build Command

```bash
npm run build
```

This executes `build.js`, which:

1. Reads all source files in dependency order (config → theme → utils → components → hooks → App)
2. Removes all `import`/`export` statements via file concatenation
3. Concatenates all modules into a single JavaScript block
4. Injects the concatenated code into `src/index.html` template
5. Minifies the entire HTML file with esbuild
6. Writes the output to `index.html`

**Output:** A single self-contained `index.html` file (~100KB) with all React, Babel, and application code bundled inline. No external dependencies except the React/Babel CDN.

### Verifying the Build

After building, test the minified version:

```bash
npm run serve
```

This runs `npm run build` followed by `npm run dev`. Visit `http://localhost:3000/Command%20Center.html` to verify the production bundle works correctly.

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

Visit `http://localhost:8080/Command%20Center.html`.

#### Option B: nginx

Copy `index.html` to your web root:

```bash
npm run build
sudo cp index.html /var/www/html/
```

Access at `http://yourdomain.com/Command%20Center.html`.

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
│   ├── index.html                # HTML template (CDN links to React/Babel)
│   ├── App.jsx                   # Root React component
│   ├── config.js                 # Centralized configuration (API URLs, intervals)
│   ├── theme.js                  # Color themes and ThemeCtx
│   ├── components/               # Presentational React components
│   │   ├── CommandCenter.jsx     # Main layout container (4-column grid)
│   │   ├── Masthead.jsx          # Top chrome with settings toggle
│   │   ├── Ticker.jsx            # Scrolling chain vitals banner
│   │   ├── Price.jsx             # BTC price card with change %
│   │   ├── LineChart.jsx         # 24-hour price chart (SVG)
│   │   ├── News.jsx              # Scrollable news ticker
│   │   ├── Weather.jsx           # Weather card
│   │   ├── Chain.jsx             # Network stats (difficulty, hashrate, fees)
│   │   ├── Miners.jsx            # BitAxe fleet status
│   │   └── ...                   # Status lights, icons, utilities
│   ├── hooks/                    # Custom data-fetching hooks
│   │   ├── useBTC.js             # Kraken price + CoinGecko chart
│   │   ├── useChain.js           # Mempool.space aggregation
│   │   ├── useBitaxe.js          # Local BitAxe API poller
│   │   ├── useWeather.js         # Open-Meteo weather
│   │   ├── useRSS.js             # RSS2JSON news aggregation
│   │   ├── useClock.js           # Time formatting
│   │   └── useFeedHealth.js      # Data source status monitoring
│   └── utils/                    # Shared utilities
│       ├── api.js                # Fetch wrappers for all external APIs
│       ├── formatting.js         # Display formatting (price, hashrate, etc.)
│       └── svg.js                # SVG component factory (icons, charts)
├── index.html           # BUILT OUTPUT (single-file dashboard)
├── build.js                      # Build script (concatenates modules)
├── bitaxe_api.py                 # Python proxy: serves dashboard + aggregates BitAxe miners
├── package.json                  # npm configuration
├── package-lock.json             # Dependency lock file
├── .gitignore                    # Git ignore rules
└── docs/                         # Documentation
    ├── ARCHITECTURE.md           # System design and data flow
    └── SETUP.md                  # This file
```

### Key Files Explained

- **`index.html`** — The release artifact. Everything needed to run the dashboard is bundled here: React, Babel, all component code, styling, and data-fetching logic.
- **`build.js`** — The build script. Reads source modules, strips import/export, concatenates, and minifies.
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
   - [CoinGecko API Status](https://www.coingecko.com/en/api) — Price chart
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
1. **Verify RSS2JSON limits:** RSS2JSON (free tier) has rate limits. If you're running the app frequently, consider adding an API key in `src/config.js`:
   ```javascript
   const RSS2JSON_API_KEY = 'your_key_here';
   ```
   Sign up at [rss2json.com](https://rss2json.com/) for a free API key.

2. **Check feed URLs:** Open `src/config.js` and verify the RSS feed list (`RSS_FEEDS`). Some feeds may be down or have changed URLs.
3. **Network tab:** Inspect RSS2JSON requests in DevTools. Look for 4xx errors (bad feed URL) or 5xx errors (service issue).
4. **CORS issues:** Some RSS feeds may block requests from browsers. RSS2JSON acts as a proxy, but if it's down, news won't load.

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
1. **Check Node.js version:** Ensure you're running Node.js 20 or higher:
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

Notes:
- The proxy validates `Origin`/`Referer` on every request and returns 403 for anything outside the allowlist.
- The default allowlist covers `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:3002`, `http://127.0.0.1:3002`. Add your LAN URL only when you need it.
- This is not authentication. Anyone on your LAN who can spoof the `Origin` header (trivial with `curl`) can reach the proxy. Treat your LAN as trusted, or run a reverse proxy with HTTP basic auth in front.

## Support & Contributing

For issues, feature requests, or contributions, see the main repository README or contact the project maintainers.

---

**Last updated:** May 2026
