# Mobile Feature Parity — Design Spec
_2026-06-10_

## Context

The Daily Node renders either `MobileApp` or `CommandCenter` (desktop) based on a 900 px breakpoint. The mobile view was missing several metrics that the desktop surfaces via `DesktopTicker` and `Sidebar`. This spec closes those gaps.

Two items from the original gap list were already implemented and require no work:
- `LineChart` — already rendered in `BitcoinPanel` (line 84)
- `OnThisDay` — already rendered in `BitcoinPanel` (line 131)

## Scope

Three files change. `MobileApp.jsx` gets one prop-pass addition.

---

## 1. BitcoinPanel (`src/components/mobile/BitcoinPanel.jsx`)

### 1a. Chain Vitals grid: 6 → 8 items

Replace the current 6-item grid (Hashrate, Difficulty, Block Time, Mempool, Fast Fee, Height) with an 8-item grid by inserting:

| New label | Source field | Notes |
|---|---|---|
| Eco Fee | `chain.data.feeEco` | Displayed as `${c.feeEco} sat/vB` |
| CLR | derived | `Math.ceil(chain.data.mempoolBytes / 1_000_000)` blocks; colored green ≤2, neutral ≤8, red >8 (same thresholds as `DesktopTicker`) |

Grid order (reading order, 2 columns): Hashrate, Difficulty, Block Time, Mempool, Fast Fee, Eco Fee, CLR, Height.

### 1b. New "Epoch & Halving" section

Insert a new section **after `Chain Vitals` and before `On This Day`**. Reading order: Price → Chart → Field Report → Chain Vitals → Epoch & Halving → On This Day.

**Contents:**
- Section label: `Epoch & Halving`
- Progress bar: filled to `chain.data.progressPercent`%, orange fill (`T.orange`), height 4 px
- Caption row (flex, space-between): `{progressPercent.toFixed(0)}% complete` · `{fmtNum(remainingBlocks)} blk left`
- Supply row: label `Supply`, value `chain.data.circulating` (already a formatted string from `useChain` enrichment)
- Halving row (flex, space-between): `chain.data.nextHalvingDate` (already formatted string) · `{halvingBlocksLeft} blk` where `halvingBlocksLeft = fmtNum(Math.ceil((height + 1) / 210000) * 210000 - height)`

**Null guard:** entire section hidden when `chain.data` is null.

**Imports to add:** `fmtNum` from `../../utils/formatting.js` (already used in `DesktopTicker`).

---

## 2. MinersPanel (`src/components/mobile/MinersPanel.jsx`)

### 2a. New `chain` prop

`MinersPanel` currently only receives `bitaxe`. Add `chain` to the function signature.

`MobileApp.jsx` line 93: `<MinersPanel bitaxe={bitaxe} />` → `<MinersPanel bitaxe={bitaxe} chain={chain} />`

### 2b. Fleet summary additions

Below the existing `{onlineCount}/{miners.length} online · {totalHashTHs.toFixed(2)} TH/s` line, add a 2-column stat grid (same pattern as `BitcoinPanel` vitals) containing:

| Label | Value | Guard |
|---|---|---|
| Efficiency | `{combinedEff} J/TH` | Only when `totalHashrateTHS > 0` |
| Solo odds | `1:{fmtNum(soloOdds.oddsPerDay)}/d` | Only when `soloOdds != null` |
| ETA | `~{fmtNum(soloOdds.etaYears)} yrs` | Only when `soloOdds != null` |

Derived values (mirrors `DesktopTicker`):
```js
const onlineMiners = miners.filter(m => m.online && m.data);
const totalPower   = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
const combinedEff  = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : null;
const soloOdds     = chain.data && totalHashrateTHS > 0
  ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS)
  : null;
```

**Imports to add:** `calcSoloOdds`, `fmtNum` from `../../utils/formatting.js`.

---

## 3. NewsPanel (`src/components/mobile/NewsPanel.jsx`)

### Lead story enrichment

The RSS item shape includes `img` (optional URL) and `snippet` (stripped HTML text, up to 1000 chars). Neither is currently displayed in the lead story section.

Add to the lead story block (`section` at top of `NewsPanel`):

1. **Image** — if `lead.img` is non-null, render an `<img>` tag above the headline:
   ```
   width: 100%, height: 160px, object-fit: cover, border-radius: 6px, margin-bottom: 10px
   ```
   The image element must include `alt=""` (decorative) and `onError={() => hide}` to suppress broken-image indicators.

2. **Snippet** — if `lead.snippet` is truthy, render below the `<h2>` headline:
   ```
   font-family: T.body, font-size: 14, line-height: 1.5, color: T.ink2
   max 160 chars + "…" truncation
   ```

Both are purely additive — the rest of the lead story layout is unchanged.

---

## Architecture summary

| File | Change |
|---|---|
| `src/components/mobile/BitcoinPanel.jsx` | Add 2 vitals, add Epoch & Halving section |
| `src/components/mobile/MinersPanel.jsx` | Add `chain` prop; add efficiency + solo stats to fleet summary |
| `src/components/mobile/NewsPanel.jsx` | Add `img` + `snippet` to lead story block |
| `src/components/mobile/MobileApp.jsx` | Pass `chain` to `MinersPanel` |

No new files. No new hooks. No new API calls. All data is already fetched and available.

---

## Testing

- `npm test` (lint + smoke + vitest + Python) must pass after each file edit
- Visual: preview at mobile width (390 px) and verify each new section renders and is not visually broken
- Null guard: confirm panels render cleanly when `chain.data` is null (loading state)
