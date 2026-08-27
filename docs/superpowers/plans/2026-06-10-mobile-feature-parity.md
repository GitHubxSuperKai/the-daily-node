# Mobile Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 missing metrics and 2 visual enrichments to the mobile dashboard's 4 panels so they match the desktop's data density.

**Architecture:** Four independent component edits — no new hooks, no new API calls, all data already fetched. MobileApp.jsx gets one prop-pass line changed. Each task has its own test file (created or updated) and its own commit.

**Tech Stack:** React (inline styles via `useT()`), @testing-library/react, vitest, esbuild bundle

---

## File Map

| File | Change |
|---|---|
| `src/components/mobile/BitcoinPanel.jsx` | Expand Chain Vitals grid (6→8 items), add Epoch & Halving section |
| `src/components/mobile/MinersPanel.jsx` | Accept `chain` prop, add efficiency + solo stats to fleet summary |
| `src/components/mobile/NewsPanel.jsx` | Add lead-story image + snippet |
| `src/components/mobile/MobileApp.jsx` | Pass `chain` prop to `MinersPanel` |
| `tests/unit/mobile/BitcoinPanel.test.jsx` | Create — covers eco fee, CLR, epoch section |
| `tests/unit/mobile/MinersPanel.test.jsx` | Update — add chain fixture, test efficiency + solo stats |
| `tests/unit/mobile/NewsPanel.test.jsx` | Create — covers image and snippet rendering |

**Test command (run after every task):**
```
npm.cmd test
```
Expected: all 211+ vitest tests pass, smoke passes, lint passes.

---

### Task 1: BitcoinPanel — expand Chain Vitals grid (eco fee + CLR)

**Files:**
- Create: `tests/unit/mobile/BitcoinPanel.test.jsx`
- Modify: `src/components/mobile/BitcoinPanel.jsx`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/unit/mobile/BitcoinPanel.test.jsx`:

```jsx
import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { BitcoinPanel } from '../../../src/components/mobile/BitcoinPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

// jsdom normalizes hex colors to rgb() on read-back; convert for assertions
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const btcProps = {
  data: { price: 67000, chgPct: 2.1, hi: 68000, lo: 65000, cap: 1.3e12 },
  chartPts: [],
};

const chainProps = {
  data: {
    hashrate: 800e18,
    difficulty: 95e12,
    blockTimeMs: 600000,
    mempoolBytes: 9_000_000,
    feeFast: 30,
    feeEco: 8,
    height: 900000,
    progressPercent: 71.3,
    remainingBlocks: 591,
    circulating: '19.86M BTC',
    nextHalvingDate: 'Apr 2028',
  },
  recentBlocks: [],
  mempoolBlocks: [],
};

describe('BitcoinPanel — Chain Vitals', () => {
  it('renders eco fee', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('8 sat/vB')).toBeDefined();
  });

  it('renders CLR blocks', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('9 blk')).toBeDefined();
  });

  it('CLR value is red when > 8 blocks', () => {
    const { container } = wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    const clrEl = screen.getByText('9 blk');
    expect(clrEl.style.color).toBe(hexToRgb(LIGHT.red));
  });

  it('CLR value is green when <= 2 blocks', () => {
    // 900_000 bytes → Math.ceil(0.9) = 1 blk → green threshold (≤ 2)
    const smallMempool = { data: { ...chainProps.data, mempoolBytes: 900_000 }, recentBlocks: [], mempoolBlocks: [] };
    wrap(<BitcoinPanel btc={btcProps} chain={smallMempool} />);
    const clrEl = screen.getByText('1 blk');
    expect(clrEl.style.color).toBe(hexToRgb(LIGHT.green));
  });
});
```

- [ ] **Step 1.2: Run tests — expect failure**

```
npm.cmd test
```

Expected: tests fail with errors like "Unable to find an element with the text: 8 sat/vB" and "Unable to find an element with the text: 9 blk".

- [ ] **Step 1.3: Implement — update BitcoinPanel.jsx**

Open `src/components/mobile/BitcoinPanel.jsx`. Make these changes:

**a) Update the import line** (add `fmtNum`):

Replace:
```js
import { fmtPrice, fmtPct, fmtHashrate, fmtDiff, fmtMempoolMB, fmtBlockTime } from '../../utils/formatting.js';
```
With:
```js
import { fmtPrice, fmtPct, fmtHashrate, fmtDiff, fmtMempoolMB, fmtBlockTime, fmtNum } from '../../utils/formatting.js';
```

**b) Before the `vitals` array, add CLR calculation** (insert after `const chgColor = ...`):

```js
  const blocksToClr = c ? Math.ceil(c.mempoolBytes / 1_000_000) : null;
  const clrColor    = blocksToClr == null ? T.ink : blocksToClr <= 2 ? T.green : blocksToClr <= 8 ? T.ink : T.red;
```

**c) Replace the `vitals` array** (6 items → 8 items with per-item color):

Replace:
```js
  const vitals = [
    { label: 'Hashrate',   value: c ? fmtHashrate(c.hashrate) : '—' },
    { label: 'Difficulty', value: c ? fmtDiff(c.difficulty) : '—' },
    { label: 'Block Time', value: c ? fmtBlockTime(c.blockTimeMs) : '—' },
    { label: 'Mempool',    value: c ? fmtMempoolMB(c.mempoolBytes) : '—' },
    { label: 'Fast Fee',   value: c ? `${c.feeFast} sat/vB` : '—' },
    { label: 'Height',     value: c ? `#${Number(c.height).toLocaleString('en-US')}` : '—' },
  ];
```
With:
```js
  const vitals = [
    { label: 'Hashrate',   value: c ? fmtHashrate(c.hashrate) : '—',                          color: T.ink },
    { label: 'Difficulty', value: c ? fmtDiff(c.difficulty) : '—',                             color: T.ink },
    { label: 'Block Time', value: c ? fmtBlockTime(c.blockTimeMs) : '—',                       color: T.ink },
    { label: 'Mempool',    value: c ? fmtMempoolMB(c.mempoolBytes) : '—',                      color: T.ink },
    { label: 'Fast Fee',   value: c ? `${c.feeFast} sat/vB` : '—',                             color: T.ink },
    { label: 'Eco Fee',    value: c ? `${c.feeEco} sat/vB` : '—',                              color: T.ink },
    { label: 'CLR',        value: blocksToClr != null ? `${blocksToClr} blk` : '—',            color: clrColor },
    { label: 'Height',     value: c ? `#${Number(c.height).toLocaleString('en-US')}` : '—',    color: T.ink },
  ];
```

**d) Update the value `<div>` inside the vitals map** to use `v.color`:

Replace the inner value div:
```jsx
                <div style={{
                  fontFamily: T.mono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.ink,
                }}>{v.value}</div>
```
With:
```jsx
                <div style={{
                  fontFamily: T.mono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: v.color,
                }}>{v.value}</div>
```

- [ ] **Step 1.4: Run tests — expect pass**

```
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add tests/unit/mobile/BitcoinPanel.test.jsx src/components/mobile/BitcoinPanel.jsx
git commit -m "feat(mobile): add eco fee and CLR to BitcoinPanel chain vitals"
```

---

### Task 2: BitcoinPanel — Epoch & Halving section

**Files:**
- Modify: `tests/unit/mobile/BitcoinPanel.test.jsx` (add tests)
- Modify: `src/components/mobile/BitcoinPanel.jsx` (add section)

- [ ] **Step 2.1: Add failing tests**

Append to `tests/unit/mobile/BitcoinPanel.test.jsx` (after the existing describe block):

```jsx
describe('BitcoinPanel — Epoch & Halving section', () => {
  it('renders epoch progress percentage', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText(/71% complete/)).toBeDefined();
  });

  it('renders remaining blocks', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText(/591 blk left/)).toBeDefined();
  });

  it('renders circulating supply', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('19.86M BTC')).toBeDefined();
  });

  it('renders next halving date', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('Apr 2028')).toBeDefined();
  });

  it('renders halving blocks remaining', () => {
    // height 900000 → next multiple of 210000 is 1050000 → 150000 blk remaining
    wrap(<BitcoinPanel btc={btcProps} chain={chainProps} />);
    expect(screen.getByText('150,000 blk')).toBeDefined();
  });

  it('epoch section is hidden when chain.data is null', () => {
    wrap(<BitcoinPanel btc={btcProps} chain={{ data: null, recentBlocks: [], mempoolBlocks: [] }} />);
    expect(screen.queryByText(/complete/)).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run tests — expect failure**

```
npm.cmd test
```

Expected: new epoch/halving tests fail (section doesn't exist yet).

- [ ] **Step 2.3: Implement — add section to BitcoinPanel.jsx**

In `src/components/mobile/BitcoinPanel.jsx`, find the `{/* ── On This Day ── */}` block and insert the new section immediately before it:

```jsx
      {/* ── Epoch & Halving ── */}
      {c && (
        <div>
          <div style={sectionLabel(T)}>Epoch & Halving</div>
          <div style={{ height: 4, background: T.rule2, borderRadius: 2, marginBottom: 4 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(c.progressPercent || 0, 100)}%`,
              background: T.orange,
              borderRadius: 2,
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: T.sans,
            fontSize: 10,
            color: T.ink3,
            marginBottom: 12,
          }}>
            <span>{(c.progressPercent || 0).toFixed(0)}% complete</span>
            <span>{fmtNum(c.remainingBlocks)} blk left</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 600,
              letterSpacing: 1.5, textTransform: 'uppercase',
              color: T.ink3, marginBottom: 2,
            }}>Supply</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.ink }}>
              {c.circulating || '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: T.sans, fontSize: 9, fontWeight: 600,
              letterSpacing: 1.5, textTransform: 'uppercase',
              color: T.ink3, marginBottom: 2,
            }}>Next Halving</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.ink }}>
                {c.nextHalvingDate || '—'}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3 }}>
                {c.height ? `${fmtNum(Math.ceil((c.height + 1) / 210000) * 210000 - c.height)} blk` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2.4: Run tests — expect pass**

```
npm.cmd test
```

Expected: all tests pass, including the 6 new epoch/halving tests.

- [ ] **Step 2.5: Commit**

```bash
git add tests/unit/mobile/BitcoinPanel.test.jsx src/components/mobile/BitcoinPanel.jsx
git commit -m "feat(mobile): add Epoch & Halving section to BitcoinPanel"
```

---

### Task 3: MinersPanel — chain prop + fleet efficiency and solo stats

**Files:**
- Modify: `tests/unit/mobile/MinersPanel.test.jsx`
- Modify: `src/components/mobile/MinersPanel.jsx`
- Modify: `src/components/mobile/MobileApp.jsx`

- [ ] **Step 3.1: Add failing tests**

Open `tests/unit/mobile/MinersPanel.test.jsx`. Add the following fixtures and describe block **after** the existing `describe('MinersPanel', ...)` block:

```jsx
const chainWithHashrate = {
  data: { hashrate: 5e18 },
};

const minersWithPower = {
  miners: [
    { ip: '<miner-ip-1>', online: true,  data: { hostname: 'bitaxe-01', hashRate: 5000, temp: 62, power: 200 } },
    { ip: '<miner-ip-2>', online: false, data: null },
  ],
};

describe('MinersPanel — efficiency and solo stats', () => {
  it('renders fleet efficiency in J/TH', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('40.0 J/TH')).toBeDefined();
  });

  it('renders solo odds', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('1:6,944/d')).toBeDefined();
  });

  it('renders ETA years', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('~19 yrs')).toBeDefined();
  });

  it('efficiency section hidden when no miners online', () => {
    const noOnline = { miners: [{ ip: '<miner-ip-1>', online: false, data: null }] };
    wrap(<MinersPanel bitaxe={noOnline} chain={chainWithHashrate} />);
    expect(screen.queryByText(/J\/TH/)).toBeNull();
  });

  it('solo odds hidden when chain.data is null', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={{ data: null }} />);
    // Efficiency still shows (local calc); solo odds require chain.data
    expect(screen.getByText('40.0 J/TH')).toBeDefined();
    expect(screen.queryByText(/\/d/)).toBeNull();
  });

  it('existing tests still pass when chain prop omitted', () => {
    wrap(<MinersPanel bitaxe={{ miners: [] }} />);
    expect(screen.getByText(/no miners configured/i)).toBeDefined();
  });
});
```

- [ ] **Step 3.2: Run tests — expect failure**

```
npm.cmd test
```

Expected: new efficiency/solo tests fail ("Unable to find an element with the text: 40.0 J/TH" etc.).

- [ ] **Step 3.3: Implement — update MinersPanel.jsx**

Open `src/components/mobile/MinersPanel.jsx`. Make these changes:

**a) Update the import** (add `calcSoloOdds`, `fmtNum`):

Replace:
```js
import { useT } from '../../theme.js';
```
With:
```js
import { useT } from '../../theme.js';
import { calcSoloOdds, fmtNum } from '../../utils/formatting.js';
```

**b) Update the function signature** (add `chain`):

Replace:
```js
function MinersPanel({ bitaxe }) {
```
With:
```js
function MinersPanel({ bitaxe, chain }) {
```

**c) Add derived calculations** after the existing `const totalHashTHs = ...` line:

```js
  const onlineMiners     = miners.filter(m => m.online && m.data);
  const totalHashrateTHS = onlineMiners.reduce((s, m) => s + ((m.data.hashRate || 0) / 1000), 0);
  const totalPower       = onlineMiners.reduce((s, m) => s + (m.data.power || 0), 0);
  const combinedEff      = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : null;
  const soloOdds         = (chain && chain.data && totalHashrateTHS > 0)
    ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS)
    : null;
```

Note: `totalHashTHs` (the existing variable used for the summary line) can remain as-is. The new `totalHashrateTHS` is used for efficiency/solo calculations.

**d) Replace the fleet summary ternary** in the JSX — the else-branch is currently a single `<div>`, and adding a sibling element requires wrapping it in a React fragment. Replace the entire `{miners.length === 0 ? ... : ...}` block:

Replace:
```jsx
        {miners.length === 0 ? (
          <div style={{ fontFamily: T.sans, fontSize: 14, color: T.ink3 }}>
            No miners configured — open Settings
          </div>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 16, color: T.ink }}>
            {onlineCount}/{miners.length} online · {totalHashTHs.toFixed(2)} TH/s
          </div>
        )}
```
With:
```jsx
        {miners.length === 0 ? (
          <div style={{ fontFamily: T.sans, fontSize: 14, color: T.ink3 }}>
            No miners configured — open Settings
          </div>
        ) : (
          <>
            <div style={{ fontFamily: T.mono, fontSize: 16, color: T.ink }}>
              {onlineCount}/{miners.length} online · {totalHashTHs.toFixed(2)} TH/s
            </div>
            {combinedEff !== null && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 12px',
                marginTop: 10,
                paddingTop: 10,
                borderTop: `0.5px solid ${T.rule2}`,
              }}>
                <div>
                  <div style={{
                    fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                    letterSpacing: 1.5, textTransform: 'uppercase',
                    color: T.ink3, marginBottom: 2,
                  }}>Efficiency</div>
                  <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {combinedEff} J/TH
                  </div>
                </div>
                {soloOdds && (
                  <div>
                    <div style={{
                      fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: T.ink3, marginBottom: 2,
                    }}>Solo odds</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink }}>
                      1:{fmtNum(soloOdds.oddsPerDay)}/d
                    </div>
                  </div>
                )}
                {soloOdds && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{
                      fontFamily: T.sans, fontSize: 9, fontWeight: 600,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: T.ink3, marginBottom: 2,
                    }}>ETA</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ink }}>
                      ~{fmtNum(soloOdds.etaYears)} yrs
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
```

- [ ] **Step 3.4: Implement — update MobileApp.jsx**

Open `src/components/mobile/MobileApp.jsx`. Find the MinersPanel render (around line 93):

```jsx
      {activeTab === 'miners' && (
        <MinersPanel bitaxe={bitaxe} />
      )}
```

Replace with:

```jsx
      {activeTab === 'miners' && (
        <MinersPanel bitaxe={bitaxe} chain={chain} />
      )}
```

- [ ] **Step 3.5: Run tests — expect pass**

```
npm.cmd test
```

Expected: all tests pass, including the 6 new efficiency/solo tests.

- [ ] **Step 3.6: Commit**

```bash
git add tests/unit/mobile/MinersPanel.test.jsx src/components/mobile/MinersPanel.jsx src/components/mobile/MobileApp.jsx
git commit -m "feat(mobile): add fleet efficiency and solo odds to MinersPanel"
```

---

### Task 4: NewsPanel — lead story image and snippet

**Files:**
- Create: `tests/unit/mobile/NewsPanel.test.jsx`
- Modify: `src/components/mobile/NewsPanel.jsx`

- [ ] **Step 4.1: Write failing tests**

Create `tests/unit/mobile/NewsPanel.test.jsx`:

```jsx
import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { NewsPanel } from '../../../src/components/mobile/NewsPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const leadWithImage = {
  hed: 'Bitcoin breaks all-time high',
  link: 'https://example.com/story',
  src: 'CoinDesk',
  t: '5m ago',
  topic: 'MARKETS',
  cat: 'BTC',
  img: 'https://example.com/image.jpg',
  snippet: 'Institutional investors drove a surge past previous records as ETF inflows hit a new single-day record.',
};

const leadNoImage = {
  hed: 'Lightning Network grows',
  link: 'https://example.com/story2',
  src: 'BitcoinMagazine',
  t: '10m ago',
  topic: '',
  cat: 'TECH',
  img: null,
  snippet: '',
};

const rssWithImage = { items: [leadWithImage], err: null };
const rssNoImage   = { items: [leadNoImage],  err: null };

describe('NewsPanel — lead story', () => {
  it('renders lead headline', () => {
    wrap(<NewsPanel rss={rssWithImage} />);
    expect(screen.getByText('Bitcoin breaks all-time high')).toBeDefined();
  });

  it('renders lead image when lead.img is present', () => {
    const { container } = wrap(<NewsPanel rss={rssWithImage} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/image.jpg');
  });

  it('does not render image when lead.img is null', () => {
    const { container } = wrap(<NewsPanel rss={rssNoImage} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders snippet when lead.snippet is truthy', () => {
    wrap(<NewsPanel rss={rssWithImage} />);
    expect(screen.getByText(/Institutional investors drove/)).toBeDefined();
  });

  it('does not render snippet when lead.snippet is empty', () => {
    // NewsPanel has no <p> elements besides the snippet; absence proves no snippet rendered
    const { container } = wrap(<NewsPanel rss={rssNoImage} />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('truncates snippet longer than 160 chars', () => {
    const longSnippet = 'A'.repeat(200);
    const rssLong = { items: [{ ...leadWithImage, snippet: longSnippet }], err: null };
    wrap(<NewsPanel rss={rssLong} />);
    const truncated = screen.getByText('A'.repeat(160) + '…');
    expect(truncated).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run tests — expect failure**

```
npm.cmd test
```

Expected: image and snippet tests fail (neither is rendered yet).

- [ ] **Step 4.3: Implement — update NewsPanel.jsx**

Open `src/components/mobile/NewsPanel.jsx`.

In the lead story `<section>`, find the `<a href={lead.link}...>` element that wraps the `<h2>` headline. Add the image block **before** the `<a>` tag, and add the snippet block **after** the closing `</a>` tag:

The lead story section currently looks like:
```jsx
        <section style={{...}}>
          <div style={{...}}>
            {lead.topic === 'BREAKING' ? 'BREAKING' : `● ${lead.cat || 'TOP'}`} · {lead.src}
          </div>
          <a href={lead.link} target="_blank" rel="noopener noreferrer">
            <h2 style={{...}}>
              {lead.hed}
            </h2>
          </a>
        </section>
```

Replace it with:
```jsx
        <section style={{
          paddingBottom: 16,
          borderBottom: `1px solid ${T.rule2}`,
          borderLeft: lead.topic === 'BREAKING' ? `3px solid ${T.red}` : 'none',
          paddingLeft: lead.topic === 'BREAKING' ? 10 : 0,
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2,
            textTransform: 'uppercase',
            color: lead.topic === 'BREAKING' ? T.red : T.orange,
            marginBottom: 8,
          }}>
            {lead.topic === 'BREAKING' ? 'BREAKING' : `● ${lead.cat || 'TOP'}`} · {lead.src}
          </div>
          {lead.img && (
            <img
              src={lead.img}
              alt=""
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                borderRadius: 6,
                display: 'block',
                marginBottom: 10,
              }}
              onError={function(e) { e.target.style.display = 'none'; }}
            />
          )}
          <a href={lead.link} target="_blank" rel="noopener noreferrer">
            <h2 style={{
              fontFamily: T.serif, fontSize: 26, fontWeight: 700,
              lineHeight: 1.1, letterSpacing: -0.5, color: T.ink, margin: 0,
            }}>
              {lead.hed}
            </h2>
          </a>
          {lead.snippet && (
            <p style={{
              fontFamily: T.body,
              fontSize: 14,
              lineHeight: 1.5,
              color: T.ink2,
              marginTop: 8,
              marginBottom: 0,
            }}>
              {lead.snippet.length > 160
                ? lead.snippet.slice(0, 160) + '…'
                : lead.snippet}
            </p>
          )}
        </section>
```

- [ ] **Step 4.4: Run tests — expect pass**

```
npm.cmd test
```

Expected: all tests pass, including the 6 new NewsPanel tests.

- [ ] **Step 4.5: Commit**

```bash
git add tests/unit/mobile/NewsPanel.test.jsx src/components/mobile/NewsPanel.jsx
git commit -m "feat(mobile): add lead story image and snippet to NewsPanel"
```

---

## Visual Verification (orchestrator-run after all tasks)

The orchestrator must verify each panel at 390 px width using the Preview MCP. For each panel:

**BitcoinPanel checks:**
- Chain Vitals grid shows 8 items (verify "Eco Fee" and "CLR" labels exist)
- With simulated `mempoolBytes > 8_000_000`, CLR value is red
- Epoch & Halving section is visible below Chain Vitals with a progress bar

**MinersPanel checks:**
- When miners are online, "Efficiency", "Solo odds", and "ETA" stats appear below the fleet count
- When `chain.data` is null, the panel renders without errors; efficiency (J/TH) still shows (local calc), but solo odds/ETA cells are absent

**NewsPanel checks:**
- Lead story shows image when `lead.img` is set
- Lead story shows snippet below headline when `lead.snippet` is truthy

**Null-guard check for each panel:**
- Pass `chain={{ data: null, recentBlocks: [], mempoolBlocks: [] }}` to BitcoinPanel — should render without crashing (CLR shows "—", epoch section hidden)
- Pass `chain={undefined}` to MinersPanel — should render without crashing (no efficiency section)
