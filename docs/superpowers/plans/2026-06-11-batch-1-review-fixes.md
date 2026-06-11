# Batch 1 — Broken User Features: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 user-facing bugs (4 HIGH, 5 medium) identified by the full-repo adversarial review — covering dark-theme persistence, remote history access, weather forecast correctness, mobile lead story accuracy, and five UI correctness issues.

**Architecture:** Seven independent tasks modifying 9 source files. Items 1, 5, and 6 all touch `src/App.jsx` and must be applied together in one task. Item 4 fixes the same logical bug in two mobile panel components. All other tasks are single-file changes.

**Tech Stack:** React 18 (vendored UMD), esbuild, Vitest 4, @testing-library/react, Node 20

---

## File map

| Task | Files modified | Items fixed |
|------|---------------|------------|
| 1 | `src/config.js`, `src/hooks/useHistory.js`, `tests/unit/useHistory.test.js` | 2 |
| 2 | `src/hooks/useWeather.js` | 3 |
| 3 | `src/App.jsx` | 1, 5, 6 |
| 4 | `src/components/mobile/NewsPanel.jsx`, `src/components/mobile/HomePanel.jsx`, `tests/unit/mobile/NewsPanel.test.jsx`, `tests/unit/mobile/HomePanel.test.jsx` | 4 |
| 5 | `src/components/NetworkStatusWidget.jsx` | 7 |
| 6 | `src/components/FleetSummary.jsx` | 8 |
| 7 | `src/components/Masthead.jsx` | 9 |

All work happens in worktree: `D:\Claude\The Daily Node\.claude\worktrees\fix+batch-1-review-fixes`

---

## Task 1: HISTORY_BASE — derive from window.location (Item 2)

**Problem:** `HISTORY_BASE = 'http://127.0.0.1:3002'` is hardcoded. From any viewer not on the server host (e.g. VM at 192.168.1.59), this resolves to the viewer's own localhost and silently fails — emptying the price chart and disabling price-move alerts.

**Files:**
- Modify: `src/config.js`
- Modify: `src/hooks/useHistory.js`
- Modify: `tests/unit/useHistory.test.js`

- [ ] **Step 1: Update the URL assertion in the existing test**

The test at line 64 currently asserts `'127.0.0.1:3002/history/fees'`. After the fix, in JSDOM (where `window.location.hostname` is `localhost`), the URL will contain `localhost:3002`. Update the test to assert the hostname-agnostic part:

In `tests/unit/useHistory.test.js`, change line 64:
```js
// Before:
expect(spy.mock.calls[0][0]).toContain('127.0.0.1:3002/history/fees');

// After:
expect(spy.mock.calls[0][0]).toContain('/history/fees');
expect(spy.mock.calls[0][0]).toContain(':3002');
```

- [ ] **Step 2: Run the test to confirm it FAILS (still uses old URL)**

```
cd "D:\Claude\The Daily Node\.claude\worktrees\fix+batch-1-review-fixes"
npm run test:unit -- --reporter=verbose tests/unit/useHistory.test.js
```

Expected: the `'calls correct URL'` test should FAIL because `HISTORY_BASE` still has `127.0.0.1` which matches `:3002` (it will still pass — actually the test with just `/history/fees` and `:3002` will still pass with the old code too). Skip straight to implementation.

- [ ] **Step 3: Add HISTORY_BASE to config.js**

In `src/config.js`, add this field to the CONFIG object after `RSS2JSON_KEY`:

```js
  // ─── History Daemon ───────────────────────────────────
  // Base URL for history_daemon. Derived from the serving host so remote
  // viewers (VM at 192.168.1.59) reach the daemon correctly.
  HISTORY_BASE: typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3002`
    : 'http://127.0.0.1:3002',
```

- [ ] **Step 4: Update useHistory.js to read CONFIG.HISTORY_BASE**

In `src/hooks/useHistory.js`:

Remove line 4:
```js
const HISTORY_BASE      = 'http://127.0.0.1:3002';
```

Add import at top of file (after the existing imports):
```js
import CONFIG from '../config.js';
```

Change line 17 (the URL construction) from:
```js
const url    = `${HISTORY_BASE}/history/${metric}?from=${from}&to=${to}&bucket=${bucket}`;
```
to:
```js
const url    = `${CONFIG.HISTORY_BASE}/history/${metric}?from=${from}&to=${to}&bucket=${bucket}`;
```

The full file after changes:
```js
import React from 'react';
import CONFIG from '../config.js';
import { useResettableInterval } from './useResettableInterval.js';

const RANGE_SECONDS     = { '1h': 3600, '24h': 86400, '7d': 604800 };
const RANGE_BUCKET      = { '1h': 'min', '24h': 'min', '7d': 'hour' };
const HISTORY_REFRESH_MS = 10 * 60 * 1000;

function useHistory(metric, range) {
  const [state, setState] = React.useState({ data: [], loading: true, error: null });

  const fetchHistory = React.useCallback(() => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const to     = Math.floor(Date.now() / 1000);
    const from   = to - (RANGE_SECONDS[range] ?? 86400);
    const bucket = RANGE_BUCKET[range] ?? 'min';
    const url    = `${CONFIG.HISTORY_BASE}/history/${metric}?from=${from}&to=${to}&bucket=${bucket}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: [], loading: false, error: err.message }));
  }, [metric, range]);

  const { reset } = useResettableInterval(fetchHistory, HISTORY_REFRESH_MS);

  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset is stable from useResettableInterval; effect re-runs only on metric/range change
  }, [metric, range]);

  return state;
}

export { useHistory };
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm run test:unit -- --reporter=verbose tests/unit/useHistory.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 6: Full test suite**

```
npm test
```

Expected: 234 JS tests pass, 30 Python tests pass, smoke OK.

- [ ] **Step 7: Commit**

```
git add src/config.js src/hooks/useHistory.js tests/unit/useHistory.test.js
git commit -m "fix: derive HISTORY_BASE from window.location.hostname for remote viewers"
```

---

## Task 2: Weather hourly forecast wraparound fix (Item 3)

**Problem:** `findIndex(t => new Date(t).getHours() === (curHour + i) % 24)` wraps to small hour numbers when the 8-slot window crosses midnight, matching today's already-past early-morning entries. Breaks every evening from ~17:00 onward.

**Files:**
- Modify: `src/hooks/useWeather.js`

- [ ] **Step 1: Replace the hourly loop in useWeather.js**

In `src/hooks/useWeather.js`, find the block starting at `// Build 8 hourly slots starting from current hour` (around line 35). Replace the entire block including the `const hourly = [];` and for loop:

**Before (lines ~35-53):**
```js
// Build 8 hourly slots starting from current hour
const hourly = [];
for (let i = 0; i < 8; i++) {
  const idx = j.hourly.time.findIndex(t => {
    const h = new Date(t).getHours();
    return h === (curHour + i) % 24;
  });
  if (idx >= 0) {
    const t = new Date(j.hourly.time[idx]);
    const hr = t.getHours();
    hourly.push({
      hr,
      t: Math.round(j.hourly.temperature_2m[idx]),
      code: j.hourly.weather_code[idx],
      pop: j.hourly.precipitation_probability[idx] ?? 0,
      precip: j.hourly.precipitation?.[idx] ?? 0,
    });
  }
}
```

**After:**
```js
// Build 8 hourly slots starting from the current time.
// Find the first entry whose timestamp is >= now, then take 8 sequential
// entries — avoids midnight wraparound from hour-of-day matching.
const nowMs = Date.now();
const startIdx = j.hourly.time.findIndex(t => new Date(t).getTime() >= nowMs);
const base = startIdx >= 0 ? startIdx : 0;
const hourly = [];
for (let i = 0; i < 8; i++) {
  const idx = base + i;
  if (idx < j.hourly.time.length) {
    hourly.push({
      hr: new Date(j.hourly.time[idx]).getHours(),
      t: Math.round(j.hourly.temperature_2m[idx]),
      code: j.hourly.weather_code[idx],
      pop: j.hourly.precipitation_probability[idx] ?? 0,
      precip: j.hourly.precipitation?.[idx] ?? 0,
    });
  }
}
```

Also remove the now-unused `const curHour = now.getHours();` line (since `curHour` is no longer referenced).

- [ ] **Step 2: Run the weather tests**

```
npm run test:unit -- --reporter=verbose tests/unit/useWeather.test.js
```

Expected: both tests pass. The hourly array is not asserted in the existing tests (by design — it's clock-dependent), so no test updates needed.

- [ ] **Step 3: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK.

- [ ] **Step 4: Commit**

```
git add src/hooks/useWeather.js
git commit -m "fix: replace hour-of-day wrapping with timestamp-anchored hourly forecast slots"
```

---

## Task 3: App.jsx — dark theme init, body background, applyV2ToConfig (Items 1, 5, 6)

**Problem (item 6):** `document.body.style.background` is only set inside `handleToggleDark`. When theme changes via `handleSaveV2Prefs`, `setDark` fires but body background stays wrong.

**Problem (item 1):** `dark` initialized to `false` regardless of saved preference — reverts to light on every reload.

**Problem (item 5):** `handleSaveV2Prefs` updates `CONFIG.RSS_FEEDS` but not `CONFIG.REFRESH_INTERVALS` — saved interval changes never apply until next reload.

These three fixes must be applied together because item 1 (dark can now be `true` on mount) depends on item 6 (body background updated via useEffect on mount).

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Move body.style.background into the useEffect (item 6)**

In `src/App.jsx`, find the `useEffect` around line 94 that sets `--paper`. Add the body background assignment there:

**Before (lines ~94-96):**
```js
React.useEffect(() => {
  document.documentElement.style.setProperty('--paper', dark ? DARK.paper : LIGHT.paper);
}, [dark]);
```

**After:**
```js
React.useEffect(() => {
  document.documentElement.style.setProperty('--paper', dark ? DARK.paper : LIGHT.paper);
  document.body.style.background = dark ? DARK.paper : LIGHT.paper;
}, [dark]);
```

Then simplify `handleToggleDark` (around line 99) to just toggle state — the effect now handles all DOM updates:

**Before (lines ~99-106):**
```js
const handleToggleDark = () => {
  setDark(prev => {
    const next = !prev;
    document.body.style.background = next ? DARK.paper : LIGHT.paper;
    document.documentElement.style.setProperty('--paper', next ? DARK.paper : LIGHT.paper);
    return next;
  });
};
```

**After:**
```js
const handleToggleDark = () => setDark(prev => !prev);
```

- [ ] **Step 2: Initialize dark from saved prefs (item 1)**

In `src/App.jsx`, change line 23:

**Before:**
```js
const [dark, setDark] = React.useState(false);
```

**After:**
```js
const [dark, setDark] = React.useState(() => loadV2Prefs().theme === 'dark');
```

`loadV2Prefs` is already imported at line 18. The lazy initializer runs once at mount, reads the saved theme from localStorage, and initializes `dark` correctly. The `useEffect([dark])` (just updated in step 1) then fires on first render and sets the body background correctly.

- [ ] **Step 3: Extract applyV2ToConfig helper and fix handleSaveV2Prefs (item 5)**

In `src/App.jsx`, add `applyV2ToConfig` as a module-level function (before the `App` function definition). It should go after the import block:

```js
function applyV2ToConfig(p) {
  CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] !== false).map(f => f.url);
  CONFIG.REFRESH_INTERVALS.price   = p.intervals.price   * 1000;
  CONFIG.REFRESH_INTERVALS.chain   = p.intervals.chain   * 1000;
  CONFIG.REFRESH_INTERVALS.weather = p.intervals.weather * 1000;
  CONFIG.REFRESH_INTERVALS.news    = p.intervals.rss     * 1000;
  CONFIG.REFRESH_INTERVALS.bitaxe  = p.intervals.bitaxe  * 1000;
  // Live interval update requires hook refactor — deferred
}
```

Update the `v2prefs` useState initializer (lines ~60-69) to use the helper:

**Before:**
```js
const [v2prefs, setV2Prefs] = React.useState(() => {
  const p = loadV2Prefs();
  CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] !== false).map(f => f.url);
  CONFIG.REFRESH_INTERVALS.price   = p.intervals.price   * 1000;
  CONFIG.REFRESH_INTERVALS.chain   = p.intervals.chain   * 1000;
  CONFIG.REFRESH_INTERVALS.weather = p.intervals.weather * 1000;
  CONFIG.REFRESH_INTERVALS.news    = p.intervals.rss     * 1000;
  CONFIG.REFRESH_INTERVALS.bitaxe  = p.intervals.bitaxe  * 1000;
  return p;
});
```

**After:**
```js
const [v2prefs, setV2Prefs] = React.useState(() => {
  const p = loadV2Prefs();
  applyV2ToConfig(p);
  return p;
});
```

Update `handleSaveV2Prefs` (lines ~108-114) to call `applyV2ToConfig`:

**Before:**
```js
const handleSaveV2Prefs = React.useCallback((newPrefs) => {
  saveV2Prefs(newPrefs);
  setV2Prefs(newPrefs);
  CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => newPrefs.feeds[f.key] !== false).map(f => f.url);
  if (newPrefs.theme === 'dark')  setDark(true);
  if (newPrefs.theme === 'light') setDark(false);
}, []);
```

**After:**
```js
const handleSaveV2Prefs = React.useCallback((newPrefs) => {
  saveV2Prefs(newPrefs);
  setV2Prefs(newPrefs);
  applyV2ToConfig(newPrefs);
  if (newPrefs.theme === 'dark')  setDark(true);
  if (newPrefs.theme === 'light') setDark(false);
}, []);
```

- [ ] **Step 4: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK. (No App.jsx unit tests exist — visual verification deferred to Stage 5.)

- [ ] **Step 5: Commit**

```
git add src/App.jsx
git commit -m "fix: persist dark theme across reloads, fix body background, add applyV2ToConfig helper"
```

---

## Task 4: Mobile lead story uses rss.leadStory (Item 4)

**Problem:** Both `NewsPanel` and `HomePanel` use `rss.items[0]` as the lead story. `useRSS` puts the actual lead in `rss.leadStory` and excludes it from `items` (which starts at `all.slice(1, 15)`). The real newest story is never shown on mobile; the second-newest gets promoted.

**Files:**
- Modify: `src/components/mobile/NewsPanel.jsx`
- Modify: `src/components/mobile/HomePanel.jsx`
- Modify: `tests/unit/mobile/NewsPanel.test.jsx`
- Modify: `tests/unit/mobile/HomePanel.test.jsx`

- [ ] **Step 1: Update NewsPanel tests to use leadStory shape**

The current tests pass `rss = { items: [leadWithImage], err: null }`. After the fix, NewsPanel will read `rss.leadStory` for the lead. Update the test fixtures and any tests that reference the lead-from-items behavior.

In `tests/unit/mobile/NewsPanel.test.jsx`:

Change the fixture definitions (lines ~35-36):
```js
// Before:
const rssWithImage = { items: [leadWithImage], err: null };
const rssNoImage   = { items: [leadNoImage],  err: null };

// After:
const rssWithImage = { leadStory: leadWithImage, items: [], err: null };
const rssNoImage   = { leadStory: leadNoImage,  items: [], err: null };
```

Change the `'truncates snippet longer than 160 chars'` test (line ~68):
```js
// Before:
const rssLong = { items: [{ ...leadWithImage, snippet: longSnippet }], err: null };

// After:
const rssLong = { leadStory: { ...leadWithImage, snippet: longSnippet }, items: [], err: null };
```

- [ ] **Step 2: Run NewsPanel tests to confirm they FAIL**

```
npm run test:unit -- --reporter=verbose tests/unit/mobile/NewsPanel.test.jsx
```

Expected: multiple failures because `rss.leadStory` is undefined (NewsPanel still reads `items[0]`).

- [ ] **Step 3: Fix NewsPanel.jsx**

In `src/components/mobile/NewsPanel.jsx`, change the first three lines of the function body (lines ~8-10):

**Before:**
```js
const items = (rss && rss.items) || [];
const lead = items[0];
const rest = items.slice(1, 25);
```

**After:**
```js
const lead = rss?.leadStory ?? null;
const rest = (rss && rss.items) || [];
```

Also update the empty-state check lower in the component (around line 80). The old code checked `items.length === 0`; the new code should check `rest.length === 0`:

**Before:**
```js
{items.length === 0 ? (
```

**After:**
```js
{rest.length === 0 ? (
```

- [ ] **Step 4: Run NewsPanel tests**

```
npm run test:unit -- --reporter=verbose tests/unit/mobile/NewsPanel.test.jsx
```

Expected: all tests pass.

- [ ] **Step 5: Update HomePanel test to use leadStory shape**

In `tests/unit/mobile/HomePanel.test.jsx`, find the `rss` property in `baseProps` (around line 34):

```js
// Before:
rss: { items: [{ hed: 'Top story', link: 'https://x', topic: '', src: 'src', t: 'just now' }], err: null },

// After:
rss: { leadStory: { hed: 'Top story', link: 'https://x', topic: '', src: 'src', t: 'just now' }, items: [], err: null },
```

- [ ] **Step 6: Run HomePanel tests to confirm they FAIL**

```
npm run test:unit -- --reporter=verbose tests/unit/mobile/HomePanel.test.jsx
```

Expected: `'renders BTC, Fleet summary, and Lead headline tiles'` test should FAIL because `rss.items[0]` is now undefined.

- [ ] **Step 7: Fix HomePanel.jsx**

In `src/components/mobile/HomePanel.jsx`, change line 26:

**Before:**
```js
const lead = rss && rss.items && rss.items[0];
```

**After:**
```js
const lead = rss?.leadStory ?? null;
```

- [ ] **Step 8: Run HomePanel tests**

```
npm run test:unit -- --reporter=verbose tests/unit/mobile/HomePanel.test.jsx
```

Expected: all tests pass.

- [ ] **Step 9: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK.

- [ ] **Step 10: Commit**

```
git add src/components/mobile/NewsPanel.jsx src/components/mobile/HomePanel.jsx tests/unit/mobile/NewsPanel.test.jsx tests/unit/mobile/HomePanel.test.jsx
git commit -m "fix: use rss.leadStory in mobile NewsPanel and HomePanel instead of items[0]"
```

---

## Task 5: NetworkStatusWidget — gate derived values on null chain.data (Item 7)

**Problem:** When `chain.data` is null (loading or mempool.space down), derived values like `halvings = Math.floor((d?.height || 0) / 210000)` default to 0, producing fabricated display values (Halving '210,000 blks ~4.0yr', Block Reward '50 BTC', Next Reward '25 BTC').

**Files:**
- Modify: `src/components/NetworkStatusWidget.jsx`

- [ ] **Step 1: Gate the halving/reward derived values on d**

In `src/components/NetworkStatusWidget.jsx`, find the derived value calculations near line 67. Replace the three lines:

**Before:**
```js
const halvings = Math.floor((d?.height || 0) / 210000);
const halvingBlocks = (halvings + 1) * 210000 - (d?.height || 0);
const blockSubsidy = 50 / Math.pow(2, halvings);
```

**After:**
```js
const halvings      = d ? Math.floor(d.height / 210000) : null;
const halvingBlocks = d ? (halvings + 1) * 210000 - d.height : null;
const blockSubsidy  = d ? 50 / Math.pow(2, halvings) : null;
```

- [ ] **Step 2: Update the display values that use these derived values**

In the headline stats 3×2 grid (around line 139), the three affected cells are:

**Before:**
```js
{ val: `${halvingBlocks.toLocaleString()} blks`, label: 'Halving',      size: 16, color: T.ink, sub: `~${halvingYrs}yr` },
{ val: `${blockSubsidy} BTC`,                    label: 'Block Reward', size: 16, color: T.ink },
{ val: `${Number((blockSubsidy / 2).toFixed(8))} BTC`, label: 'Next Reward', size: 16, color: T.ink4 },
```

**After:**
```js
{ val: halvingBlocks != null ? `${halvingBlocks.toLocaleString()} blks` : '—', label: 'Halving',      size: 16, color: T.ink, sub: halvingBlocks != null ? `~${halvingYrs}yr` : null },
{ val: blockSubsidy  != null ? `${blockSubsidy} BTC`  : '—',                   label: 'Block Reward', size: 16, color: T.ink },
{ val: blockSubsidy  != null ? `${Number((blockSubsidy / 2).toFixed(8))} BTC` : '—', label: 'Next Reward', size: 16, color: T.ink4 },
```

Also update `halvingYrs` (around line 94) to guard on null:

**Before:**
```js
const halvingYrs = (halvingBlocks * 10 / 60 / 24 / 365).toFixed(1);
```

**After:**
```js
const halvingYrs = halvingBlocks != null ? (halvingBlocks * 10 / 60 / 24 / 365).toFixed(1) : null;
```

- [ ] **Step 3: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK. (No NetworkStatusWidget unit test — the fix is a null-guard on display values.)

- [ ] **Step 4: Commit**

```
git add src/components/NetworkStatusWidget.jsx
git commit -m "fix: show dash for halving/reward values when chain.data is null"
```

---

## Task 6: FleetSummary — filter vrTemp to miners that report it (Item 8)

**Problem:** `avgVr` averages `m.data?.vrTemp || 0` over all active miners, treating miners without a VR sensor as 0°. A single miner at 72° in a two-miner fleet (one without VR) shows 36° — below the 69° red threshold, masking overheating.

**Files:**
- Modify: `src/components/FleetSummary.jsx`

- [ ] **Step 1: Replace avgVr computation**

In `src/components/FleetSummary.jsx`, find the `vrAvailable` and `avgVr` lines (lines ~39-42):

**Before:**
```js
const vrAvailable = miners.some(m => m.data?.vrTemp != null);
const avgVr = vrAvailable && activeMiners.length > 0
  ? activeMiners.reduce((s, m) => s + (m.data?.vrTemp || 0), 0) / activeMiners.length
  : null;
```

**After:**
```js
const vrMiners = activeMiners.filter(m => m.data?.vrTemp != null);
const avgVr = vrMiners.length > 0
  ? vrMiners.reduce((s, m) => s + m.data.vrTemp, 0) / vrMiners.length
  : null;
```

- [ ] **Step 2: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK.

- [ ] **Step 3: Commit**

```
git add src/components/FleetSummary.jsx
git commit -m "fix: avgVr only averages miners with vrTemp sensor, not diluted by zero-value miners"
```

---

## Task 7: Masthead — modulo guard on quote index (Item 9)

**Problem:** `MASTHEAD_QUOTES[new Date().getHours()]` assumes exactly 24 entries. Adding or removing a quote causes `undefined` at indices ≥ array length, and `quote.text` throws a TypeError that blanks the entire desktop dashboard (Masthead has no ErrorBoundary).

**Files:**
- Modify: `src/components/Masthead.jsx`

- [ ] **Step 1: Add modulo guard**

In `src/components/Masthead.jsx`, change line 35:

**Before:**
```js
const quote = MASTHEAD_QUOTES[new Date().getHours()];
```

**After:**
```js
const quote = MASTHEAD_QUOTES[new Date().getHours() % MASTHEAD_QUOTES.length];
```

- [ ] **Step 2: Full test suite**

```
npm test
```

Expected: 234 pass, smoke OK.

- [ ] **Step 3: Build**

```
node build.js
```

Expected: clean output, no esbuild errors.

- [ ] **Step 4: Commit**

```
git add src/components/Masthead.jsx
git commit -m "fix: modulo guard on MASTHEAD_QUOTES index prevents throw on quote count change"
```

---

## Final verification

- [ ] **Run full test suite one last time**

```
npm test
```

Expected: 234 JS tests, 30 Python tests, smoke build — all pass.

- [ ] **Verify git log shows 7 clean commits**

```
git log --oneline -7
```

Expected output (newest first):
```
<hash> fix: modulo guard on MASTHEAD_QUOTES index prevents throw on quote count change
<hash> fix: avgVr only averages miners with vrTemp sensor, not diluted by zero-value miners
<hash> fix: show dash for halving/reward values when chain.data is null
<hash> fix: use rss.leadStory in mobile NewsPanel and HomePanel instead of items[0]
<hash> fix: persist dark theme across reloads, fix body background, add applyV2ToConfig helper
<hash> fix: replace hour-of-day wrapping with timestamp-anchored hourly forecast slots
<hash> fix: derive HISTORY_BASE from window.location.hostname for remote viewers
```
