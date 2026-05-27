import React from 'react';
import CONFIG from '../config.js';
import { sourceFreshness } from '../utils/freshness.js';
import { themeFlipDecision } from '../utils/autoTheme.js';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import { useHistory } from '../hooks/useHistory.js';
import { useAlerts } from '../hooks/useAlerts.js';
import { ErrorBoundary } from './ErrorBoundary';
import { Masthead } from './Masthead';
import { Sidebar } from './Sidebar';
import { NewsColumn } from './NewsColumn';
import { ChainColumn } from './ChainColumn';
import { MarketsColumn } from './MarketsColumn';
import { SettingsPanel } from './SettingsPanel';
import {
  fmtPrice,
  fmtPct,
  fmtNum,
  fmtVolUsd,
  fmtHashrate,
  fmtDiff,
  fmtMempoolMB,
  fmtBlockTime,
  safeISODate,
  calcSoloOdds,
} from '../utils/formatting.js';


const isFresh = t => t === 'just now' || /^\d+s ago$/.test(t) || /^[1-4]m ago$/.test(t);

export function CommandCenter({
  dark,
  onToggleDark,
  prefs,
  v2prefs,
  onSaveV2,
  settingsOpen,
  onOpenSettings,
  onSaveSettings,
  onCloseSettings,
  clock,
  btc,
  chain,
  bitaxe,
  weather,
  rss,
  feedHealth,
}) {
  const T = useT();

  const lastShouldBeDark = React.useRef(null);
  React.useEffect(() => {
    const wx = weather.data;
    if (wx?.wxSunriseHr == null) return;
    const hr = new Date().getHours();
    const shouldBeDark = hr < wx.wxSunriseHr || hr >= wx.wxSunsetHr;
    const { update, flip } = themeFlipDecision(lastShouldBeDark.current, shouldBeDark, dark);
    if (update) lastShouldBeDark.current = shouldBeDark;
    if (flip) onToggleDark();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: re-runs on clock tick only; weather.data + onToggleDark closure is read fresh
  }, [clock.timeHM, weather.data?.wxSunriseHr, dark]);

  const lastBlockTs = chain.recentBlocks?.[0]?.timestamp ?? null;
  const msSinceLastBlock = lastBlockTs ? (Date.now() / 1000 - lastBlockTs) * 1000 : null;

  const priceHistory = useHistory('price', '24h');
  const _yesterdayPrice = priceHistory.data.length > 0 ? priceHistory.data[0].usd : null;

  const { toasts } = useAlerts(
    {
      fastFee:         chain.data?.feeFast ?? null,
      msSinceLastBlock,
      miners:          bitaxe.miners,
      btcPrice:        btc.data?.price ?? null,
      priceHistory:    priceHistory.data,
    },
    v2prefs,
  );

  // Coarse 60s tick for system panel age labels — blank under 1 min, "Xm ago" after
  const [ageTick, setAgeTick] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setAgeTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Derived values
  const btcPrice = btc.data ? `$${fmtPrice(btc.data.price)}` : '—';
  const btcChgPct = btc.data ? fmtPct(btc.data.chgPct) : '—';
  const btcUp = btc.data ? btc.data.chgPct >= 0 : true;
  const btcHi = btc.data ? fmtPrice(btc.data.hi) : '—';
  const btcLo = btc.data ? fmtPrice(btc.data.lo) : '—';
  const btcCap = btc.data?.cap != null ? `$${(btc.data.cap / 1e12).toFixed(2)}T` : '—';
  const btcVol = btc.data ? fmtVolUsd(btc.data.volBtc * btc.data.price) : '—';
  const athPct = btc.data?.ath ? ((btc.data.price - btc.data.ath) / btc.data.ath) * 100 : null;
  const athAtNew = athPct != null && athPct >= 0;

  const blockHeight = chain.data ? fmtNum(chain.data.height) : '—';
  const hashrate = chain.data ? fmtHashrate(chain.data.hashrate) : '—';
  const halvings = chain.data ? Math.floor(chain.data.height / 210000) : null;
  const blockReward = halvings != null ? 50 / Math.pow(2, halvings) : null;
  const rewardEra = halvings != null ? halvings + 1 : null;
  const blockRewardStr = blockReward != null
    ? (blockReward >= 0.001 ? `${blockReward} BTC` : `${blockReward.toFixed(8)} BTC`)
    : null;
  const difficulty = chain.data ? fmtDiff(chain.data.difficulty) : '—';
  const mempoolMB = chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—';
  const mempoolTx = chain.data ? fmtNum(chain.data.mempoolTx) : '—';
  const feeFast = chain.data ? `${chain.data.feeFast} sat/vB` : '—';
  const feeEco = chain.data ? `${chain.data.feeEco} sat/vB` : '—';

  // BitAxe fleet derived
  const onlineMiners = bitaxe.miners.filter((m) => m.online && m.data);
  const minerCount = bitaxe.miners.length;
  const onlineCount = onlineMiners.length;
  const totalHashrateTHS = onlineMiners.reduce((sum, m) => sum + ((m.data.hashRate || 0) / 1000), 0);
  const totalPower = onlineMiners.reduce((sum, m) => sum + (m.data.power || 0), 0);
  const combinedEff = totalHashrateTHS > 0 ? (totalPower / totalHashrateTHS).toFixed(1) : '—';

  const soloOdds =
    chain.data && totalHashrateTHS > 0 ? calcSoloOdds(chain.data.hashrate / 1e18, totalHashrateTHS) : null;
  const etaStr = soloOdds ? `~${fmtNum(soloOdds.etaYears)} yrs` : '—';

  const diffAdjVal = chain.data?.diffAdj;
  const diffAdjStr = diffAdjVal != null ? `${diffAdjVal >= 0 ? '+' : ''}${diffAdjVal.toFixed(2)}%` : '—';
  const diffAdjCol = diffAdjVal != null ? (diffAdjVal >= 0 ? T.green : T.red) : T.ink;
  const epochPct = chain.data?.progressPercent;
  const epochBlocks = chain.data ? Math.round((epochPct / 100) * 2016) : null;
  const epochStr = epochPct != null ? `${epochPct.toFixed(0)}% · ${epochBlocks}/2016` : '—';
  const retargetDate = safeISODate(chain.data?.estimatedRetargetDate) ?? '—';
  const blockTimeSec = chain.data?.blockTimeMs ? chain.data.blockTimeMs / 1000 : null;
  const blockTimeCol =
    blockTimeSec == null ? T.ink : blockTimeSec < 570 ? T.orange : blockTimeSec <= 630 ? T.green : T.red;
  const blocksToClr = chain.data ? Math.ceil(chain.data.mempoolBytes / 1_000_000) : null;
  const blocksToClrCol = blocksToClr == null ? T.ink : blocksToClr <= 2 ? T.green : blocksToClr <= 8 ? T.ink : T.red;
  const rawFeeFast = chain.data?.feeFast;
  const rawFeeEco = chain.data?.feeEco;
  const feeFastCol = rawFeeFast == null ? T.ink : rawFeeFast < 10 ? T.green : rawFeeFast < 50 ? T.ink : T.red;
  const feeEcoCol = rawFeeEco == null ? T.ink : rawFeeEco < 5 ? T.green : rawFeeEco < 20 ? T.ink : T.red;
  const rawMempoolMB = chain.data ? chain.data.mempoolBytes / 1e6 : null;
  const mempoolCol =
    rawMempoolMB == null ? T.ink : rawMempoolMB < 10 ? T.green : rawMempoolMB < 50 ? T.ink : T.red;
  const rawMempoolTx = chain.data?.mempoolTx;
  const mempoolTxCol =
    rawMempoolTx == null ? T.ink : rawMempoolTx < 5000 ? T.green : rawMempoolTx < 20000 ? T.ink : T.red;

  const _miningRows = [
    { k: 'Hashrate', v: hashrate },
    { k: 'Difficulty', v: difficulty },
    { k: 'Avg block', v: chain.data?.blockTimeMs ? fmtBlockTime(chain.data.blockTimeMs) : '—', c: blockTimeCol },
    { k: 'Diff retarget', v: diffAdjStr, c: diffAdjCol },
    { k: 'Retarget in', v: chain.data?.remainingBlocks != null ? `${fmtNum(chain.data.remainingBlocks)} blk` : '—' },
    { k: 'Retarget date', v: retargetDate },
    { k: 'Epoch', v: epochStr },
  ];
  const _chainStatRows = [
    { k: 'Block height', v: blockHeight },
    { k: 'Circulating', v: chain.data ? chain.data.circulating : '—' },
    { k: 'Next halving', v: chain.data ? chain.data.nextHalvingDate : '—' },
  ];
  const _mempoolRows = [
    { k: 'Size', v: mempoolMB, c: mempoolCol },
    { k: 'Tx count', v: mempoolTx, c: mempoolTxCol },
    { k: 'Blocks to clear', v: blocksToClr != null ? `${blocksToClr} blk` : '—', c: blocksToClrCol },
    { k: 'Fee · fast', v: feeFast, c: feeFastCol },
    { k: 'Fee · eco', v: feeEco, c: feeEcoCol },
    ...(chain.mempoolBlocks || []).map((b, i) => ({
      k: `${i === 0 ? 'Next blk' : `+${i} blk`} · ${fmtNum(b.nTx)} tx`,
      v: b.feeRange ? `${b.feeRange[0]}–${b.feeRange[1]} s/vB` : `${b.medianFee} s/vB`,
    })),
  ];

  const freshNow = Date.now();
  const sysAgeOf = (lastOk) => {
    if (!lastOk) return '';
    const mins = Math.floor((ageTick - lastOk) / 60000);
    return mins < 1 ? '' : `↻ ${mins}m`;
  };
  const withAge = (age, desc) => age ? `${age} · ${desc}` : desc;
  const sys = [
    {
      k: 'miners',
      state: sourceFreshness({ hasData: onlineCount > 0, err: bitaxe.err, lastOk: bitaxe.lastOk, interval: bitaxe.interval }, freshNow),
      d: withAge(sysAgeOf(bitaxe.lastOk), bitaxe.loading ? 'connecting' : `${onlineCount}/${minerCount} online`),
    },
    {
      k: 'mempool',
      state: sourceFreshness({
        hasData: !!chain.data, err: chain.error, lastOk: chain.lastOk,
        interval: CONFIG.REFRESH_INTERVALS.chain,
        contentAgeMs: lastBlockTs ? freshNow - lastBlockTs * 1000 : null,
        contentMaxMs: CONFIG.CONTENT_STALE.chain,
      }, freshNow),
      d: withAge(sysAgeOf(chain.lastOk), chain.data ? `${mempoolMB}` : '—'),
    },
    {
      k: 'kraken',
      state: sourceFreshness({ hasData: !!btc.data, err: btc.error, lastOk: btc.lastOk, interval: CONFIG.REFRESH_INTERVALS.price }, freshNow),
      d: withAge(sysAgeOf(btc.lastOk), btc.data ? `${btcChgPct}% 24h` : '—'),
    },
    {
      k: 'weather',
      state: sourceFreshness({ hasData: !!weather.data, err: weather.err, lastOk: weather.lastOk, interval: weather.interval }, freshNow),
      d: withAge(sysAgeOf(weather.lastOk), weather.data ? weather.data.wxCond.toLowerCase() : '—'),
    },
    {
      k: 'rss',
      state: sourceFreshness({ hasData: rss.items.length > 0, err: rss.err, lastOk: rss.lastOk, interval: rss.interval }, freshNow),
      d: withAge(sysAgeOf(rss.lastOk), rss.items.length > 0 ? `${rss.items.length} stories` : '—'),
    },
  ];

  const wx = weather.data;
  const lead = rss.leadStory;
  const newsItems = rss.items;
  const tempUnitLabel = prefs.tempUnit === 'celsius' ? '°C' : '°F';
  const wxSummary = wx ? `${wx.temp}${tempUnitLabel} ${wx.wxCond.toLowerCase()}` : `—${tempUnitLabel}`;

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: T.paper,
        color: T.ink,
        fontFamily: T.body,
        display: 'flex',
        flexDirection: 'column',
        padding: `${u(28)} ${u(56)} ${u(32)}`,
      }}
    >
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320,
          pointerEvents: 'none',
        }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              background: T.ink, color: T.paper,
              borderRadius: 4, padding: '8px 14px',
              fontSize: 13, fontFamily: T.body,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}>
              {t.message}
            </div>
          ))}
        </div>
      )}
      {/* TOP CHROME */}
      <Masthead
        clock={clock}
        wxSummary={wxSummary}
        blockReward={blockRewardStr}
        rewardEra={rewardEra}
        dark={dark}
        onToggleDark={onToggleDark}
        onOpenSettings={onOpenSettings}
      />

      {/* TICKER */}
      <ErrorBoundary label="Ticker">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `${u(9)} 0`,
          borderBottom: `1px solid ${T.rule2}`,
          fontFamily: T.mono,
          fontSize: u(12),
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: T.sans,
            fontWeight: 700,
            fontSize: u(9),
            letterSpacing: u(2),
            color: T.ink3,
            display: 'flex',
            alignItems: 'center',
            gap: u(4),
            flexShrink: 0,
            marginRight: u(20),
          }}
        >
          LIVE
          <span
            style={{
              color: feedHealth === 'live' ? '#d63030' : feedHealth === 'degraded' ? T.orange : T.ink4,
              animation: feedHealth === 'live' ? 'live-pulse 1.4s ease-in-out infinite' : 'none',
              display: 'inline-block',
              lineHeight: 1,
            }}
          >
            ⏺
          </span>
        </span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              display: 'inline-flex',
              whiteSpace: 'nowrap',
              animation: 'ticker-scroll 100s linear infinite',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitFontSmoothing: 'subpixel-antialiased',
            }}
          >
            {(() => {
              const halvingBlocksLeft = chain.data
                ? fmtNum(Math.ceil((chain.data.height + 1) / 210000) * 210000 - chain.data.height)
                : '—';
              const items = [
                ['BLOCK', blockHeight, 'latest', T.ink3],
                ['HASH', chain.data ? fmtHashrate(chain.data.hashrate) : '—', chain.data && chain.data.diffAdj != null ? `${chain.data.diffAdj >= 0 ? '+' : ''}${chain.data.diffAdj.toFixed(1)}%` : '', T.ink3],
                ['TIME', chain.data ? fmtBlockTime(chain.data.blockTimeMs) : '—', 'avg', blockTimeCol],
                ['EPOCH', epochPct != null ? `${epochPct.toFixed(0)}%` : '—', chain.data ? `${fmtNum(chain.data.remainingBlocks)} blk left` : '', T.ink3],
                ['FEE', chain.data ? `${chain.data.feeFast} sat/vB` : '—', chain.data ? `eco ${chain.data.feeEco}` : '', T.ink3],
                ['MEMPOOL', mempoolMB, `${mempoolTx} tx`, mempoolCol],
                ['CLR', blocksToClr != null ? `${blocksToClr} blk` : '—', 'to clear', blocksToClrCol],
                ['SUPPLY', chain.data ? chain.data.circulating : '—', '', T.ink3],
                ['HALVING', chain.data?.nextHalvingDate || '—', halvingBlocksLeft !== '—' ? `${halvingBlocksLeft} blk` : '', T.ink3],
                ['FLEET', onlineCount > 0 ? `${totalHashrateTHS.toFixed(2)} TH/s` : bitaxe.err ? 'offline' : '…', onlineCount > 0 ? `${combinedEff} J/TH` : '', T.ink3],
                ['SOLO', `1:${soloOdds ? fmtNum(soloOdds.oddsPerDay) : '—'}/d`, etaStr, T.ink3],
              ];
              const renderItem = ([k, v, s, sc], pfx) => (
                <span key={pfx} style={{ display: 'inline-flex', alignItems: 'baseline', gap: u(5), paddingRight: u(36), flexShrink: 0 }}>
                  <span style={{ color: T.ink3, letterSpacing: u(1) }}>{k}</span>
                  <b style={{ fontWeight: 600, color: T.ink }}>{v}</b>
                  {s && <span style={{ color: sc }}>{s}</span>}
                </span>
              );
              return [
                ...items.map((item, i) => renderItem(item, `a${i}`)),
                ...items.map((item, i) => renderItem(item, `b${i}`)),
              ];
            })()}
          </div>
        </div>
      </div>
      </ErrorBoundary>

      {/* BODY — 4-column grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${u(300)} 1.1fr 1fr 1fr`,
          gap: u(28),
          paddingTop: u(22),
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* COL 0 — WORDMARK RAIL */}
        <ErrorBoundary label="Sidebar">
          <Sidebar clock={clock} weather={weather} prefs={prefs} sys={sys} />
        </ErrorBoundary>

        {/* COL 1 — MARKETS + LEAD STORY */}
        <ErrorBoundary label="Markets">
          <MarketsColumn btc={btc} chain={chain} rss={rss} priceHistoryData={priceHistory.data} />
        </ErrorBoundary>

        {/* COL 2 — HEADLINES FEED */}
        <ErrorBoundary label="News">
          <NewsColumn newsItems={newsItems} rssErr={rss.err} />
        </ErrorBoundary>

        {/* COL 3 — FIELD REPORT + CHAIN VITALS */}
        <ErrorBoundary label="Network">
          <ChainColumn bitaxe={bitaxe} chain={chain} />
        </ErrorBoundary>
      </div>

      {settingsOpen && (
        <SettingsPanel
          prefs={prefs}
          v2prefs={v2prefs}
          miners={bitaxe.miners}
          onRefresh={bitaxe.refresh}
          onSave={onSaveSettings}
          onSaveV2={onSaveV2}
          onClose={onCloseSettings}
        />
      )}
    </div>
  );
}
