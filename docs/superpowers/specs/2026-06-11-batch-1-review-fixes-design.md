# Batch 1 — Broken User Features: Design Spec

Date: 2026-06-11  
Branch: worktree-fix+batch-1-review-fixes  
Complexity: medium  
Source: Full-repo adversarial review (full-repo-review.mjs, run 2026-06-11)

## Overview

Nine user-facing bugs identified by the full-repo review. Four are HIGH severity (adversarially confirmed), five are medium. All fixes are well-scoped with no new interfaces or dependencies. Changes span 9 files.

---

## Items

### 1 [HIGH] Dark theme not persisted across reloads — `src/App.jsx:23`

**Problem:** `dark` state is initialized to hardcoded `false`. The `v2prefs.theme` saved preference is only consulted when the user saves settings in the current session. Every page reload (including the scheduled `usePageRefresh` reloads) reverts to light mode.

**Fix:** Initialize `dark` from saved prefs using a lazy initializer:
```js
const [dark, setDark] = React.useState(() => loadV2Prefs().theme === 'dark');
```

**Interaction:** Must be implemented alongside item 6 (body background in useEffect), because with this fix `dark` can now be `true` on first mount. The `useEffect([dark])` must set `document.body.style.background` (fixed in item 6) for the body background to be correct on that first render.

---

### 2 [HIGH] HISTORY_BASE hardcoded to 127.0.0.1 — `src/hooks/useHistory.js:4`

**Problem:** `const HISTORY_BASE = 'http://127.0.0.1:3002'` — always resolves to the *viewer's* localhost. Fails silently for all remote viewers (VM deployment at 192.168.1.59). Silently empties the price-history chart and disables the price-move alert (`checkPriceThreshold` returns false for an empty array).

**Fix:** Add `HISTORY_BASE` to `config.js`, derived from `window.location.hostname` at runtime:
```js
HISTORY_BASE: typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:3002`
  : 'http://127.0.0.1:3002',
```

`useHistory.js` drops its local constant and reads `CONFIG.HISTORY_BASE` instead.

**Rationale:** When viewed from LAN (`http://192.168.1.59:8000`), `window.location.hostname` = `192.168.1.59`, so history fetches target `http://192.168.1.59:3002` — where history_daemon is actually listening. No manual configuration required.

---

### 3 [HIGH] Hourly forecast wraparound bug — `src/hooks/useWeather.js:36-53`

**Problem:** `findIndex(t => new Date(t).getHours() === (curHour + i) % 24)` wraps to small hour numbers when the 8-slot window crosses midnight, matching *today's already-past* early-morning entries instead of tomorrow's. Breaks every evening from ~17:00 onward. Same bug exists in `src/utils/api.js` dead code (not fixed here — item in batch 5 deletes that dead code).

**Fix:** Find the starting index once using real timestamps, then take 8 sequential entries:
```js
const nowMs = Date.now();
const startIdx = j.hourly.time.findIndex(t => new Date(t).getTime() >= nowMs);
const base = startIdx >= 0 ? startIdx : 0;
const hourly = [];
for (let i = 0; i < 8; i++) {
  const idx = base + i;
  if (idx < j.hourly.time.length) {
    const t = j.hourly.time[idx];
    hourly.push({
      hr: new Date(t).getHours(),
      t: Math.round(j.hourly.temperature_2m[idx]),
      code: j.hourly.weather_code[idx],
      pop: j.hourly.precipitation_probability[idx] ?? 0,
      precip: j.hourly.precipitation?.[idx] ?? 0,
    });
  }
}
```

Anchoring on real timestamps instead of hour-of-day matching also fixes the timezone-skew case.

---

### 4 [HIGH] Mobile lead story shows wrong item — `src/components/mobile/NewsPanel.jsx:8`, `src/components/mobile/HomePanel.jsx:26`

**Problem:** Both components use `rss.items[0]` as the lead story. But `useRSS` already:
- Puts the actual newest item in `rss.leadStory`
- Returns `items = all.slice(1, 15)` with the lead excluded

Result: the real newest story is never rendered on mobile. The second-newest story is promoted to the lead slot and then *also* dropped from the headline list.

**Fix (NewsPanel):**
- Replace `const lead = rss && rss.items?.[0]` → `const lead = rss && rss.leadStory`
- Replace `const rest = rss?.items?.slice(1, 25)` → `const rest = rss?.items` (all 14 items, lead already excluded)

**Fix (HomePanel):**
- Replace `const lead = rss && rss.items?.[0]` → `const lead = rss && rss.leadStory`

---

### 5 [med] handleSaveV2Prefs does not update CONFIG.REFRESH_INTERVALS — `src/App.jsx:108`

**Problem:** `handleSaveV2Prefs` updates `CONFIG.RSS_FEEDS` but not `CONFIG.REFRESH_INTERVALS`. Saved interval changes never take effect because CONFIG is only read on mount.

**Fix:** Extract `applyV2ToConfig(p)` as a module-level helper:
```js
function applyV2ToConfig(p) {
  CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] !== false).map(f => f.url);
  CONFIG.REFRESH_INTERVALS.price   = p.intervals.price   * 1000;
  CONFIG.REFRESH_INTERVALS.chain   = p.intervals.chain   * 1000;
  CONFIG.REFRESH_INTERVALS.weather = p.intervals.weather * 1000;
  CONFIG.REFRESH_INTERVALS.news    = p.intervals.rss     * 1000;
  CONFIG.REFRESH_INTERVALS.bitaxe  = p.intervals.bitaxe  * 1000;
}
```

Call from both the `v2prefs` useState initializer and `handleSaveV2Prefs`. Running hooks capture their interval on mount and will not pick up the new value live — they will use the updated interval on the next reload (guaranteed by the scheduled `usePageRefresh`). Live interval update requires hook refactor — deferred to a future batch.

---

### 6 [med] body.style.background not updated via settings save — `src/App.jsx:94`

**Problem:** `document.body.style.background` is set only inside `handleToggleDark`'s `setState` updater. When theme changes via `handleSaveV2Prefs` (lines 112-113), `setDark` fires but the body background assignment is skipped.

**Fix:** Move `document.body.style.background` into the existing `useEffect([dark])`:
```js
React.useEffect(() => {
  document.documentElement.style.setProperty('--paper', dark ? DARK.paper : LIGHT.paper);
  document.body.style.background = dark ? DARK.paper : LIGHT.paper;
}, [dark]);
```

Reduce `handleToggleDark` to `setDark(prev => !prev)` — the effect now covers all dark-state changes regardless of trigger, including the initial mount when `dark` is `true` from saved prefs (item 1).

---

### 7 [med] NetworkStatusWidget shows fabricated values when chain.data is null — `src/components/NetworkStatusWidget.jsx:67-69`

**Problem:** When `chain.data` is null (loading or mempool.space down), derived values like `halvings = Math.floor((d?.height || 0) / 210000)` default to 0 and display fabricated metrics (Halving '210,000 blks ~4.0yr', Block Reward '50 BTC', Next Reward '25 BTC').

**Fix:** Gate all derived values on `d`:
```js
const halvings       = d ? Math.floor(d.height / 210000) : null;
const nextHalving    = d ? 210000 - (d.height % 210000) : null;
const blockReward    = d ? (50 / Math.pow(2, halvings)) : null;
const nextReward     = d ? (blockReward / 2) : null;
```

Render `'—'` for cells whose source value is null, matching the existing pattern for Hashrate and Difficulty cells.

---

### 8 [med] avgVr diluted by miners without VR sensors — `src/components/FleetSummary.jsx:39`

**Problem:** `avgVr` averages `m.data?.vrTemp || 0` over all active miners, treating miners without a VR sensor as contributing 0°. A fleet with one miner at 72° (over the 69° red threshold) and one without a VR sensor shows 36°, masking an overheating condition.

**Fix:** Average only miners that actually report `vrTemp`:
```js
const vrMiners = activeMiners.filter(m => m.data?.vrTemp != null);
const avgVr = vrMiners.length
  ? vrMiners.reduce((s, m) => s + m.data.vrTemp, 0) / vrMiners.length
  : null;
```

Render the VR temperature cell only when `vrMiners.length > 0` (or show `'—'` for no VR data).

---

### 9 [med] Masthead quote index without modulo guard — `src/components/Masthead.jsx:35`

**Problem:** `MASTHEAD_QUOTES[new Date().getHours()]` assumes the array has exactly 24 entries. Any future addition or removal of a quote causes `undefined` at indices ≥ array length, and `quote.text` throws a TypeError. Masthead is not wrapped in an ErrorBoundary, so this would blank the entire dashboard.

**Fix:**
```js
const quote = MASTHEAD_QUOTES[new Date().getHours() % MASTHEAD_QUOTES.length];
```

---

## Implementation order

1. `src/config.js` — add `HISTORY_BASE` (item 2)
2. `src/hooks/useHistory.js` — use `CONFIG.HISTORY_BASE` (item 2)
3. `src/hooks/useWeather.js` — fix forecast loop (item 3)
4. `src/App.jsx` — all three fixes together: item 6 (body bg in useEffect) + item 1 (dark init) + item 5 (applyV2ToConfig) in one pass
5. `src/components/mobile/NewsPanel.jsx` — use leadStory (item 4)
6. `src/components/mobile/HomePanel.jsx` — use leadStory (item 4)
7. `src/components/NetworkStatusWidget.jsx` — null gate on derived values (item 7)
8. `src/components/FleetSummary.jsx` — filter vrMiners (item 8)
9. `src/components/Masthead.jsx` — modulo guard (item 9)

## Verification

- `npm test` passes (234 JS unit tests + 30 Python tests + smoke build)
- Build (`node build.js`) produces clean output — no esbuild errors
- No new test files required; existing tests cover the hook and component shapes
