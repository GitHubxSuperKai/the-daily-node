import React from 'react';
import CONFIG from '../config.js';
import { sourceFreshness } from '../utils/freshness.js';
import { themeFlipDecision } from '../utils/autoTheme.js';
import { useT } from '../theme';
import { ErrorBoundary } from './ErrorBoundary';
import { Masthead } from './Masthead';
import { Rule } from './Rule';
import { Kicker } from './Kicker';
import { OnThisDay } from './OnThisDay';
import { ProofOfRead } from './ProofOfRead';
import { Num } from './Num';
import StatusDot from './StatusDot';
import { WxGlyph } from './WxGlyph';
import { LineChart } from './LineChart';
import { NetworkStatusWidget } from './NetworkStatusWidget';
import Miners from './Miners';
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
} from '../utils';


/**
 * CommandCenter — Main layout orchestrator
 * Renders a 4-column newspaper dashboard on desktop/TV.
 *
 * Layout uses CSS --u variable (set by index.html) so all dimensions
 * scale proportionally across 4K, 2K, 1080p, and smaller screens.
 */
function LeadImage({ src, domain }) {
  const T = useT();
  const [errored, setErrored] = React.useState(false);
  if (errored) {
    return (
      <div style={{
        width: '100%',
        height: u(80),
        background: `repeating-linear-gradient(45deg, ${T.rule3} 0, ${T.rule3} 1px, transparent 0, transparent 8px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 3,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: u(10), color: T.ink4 }}>{domain}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: u(160), objectFit: 'cover', borderRadius: 3, display: 'block' }}
      onError={() => setErrored(true)}
    />
  );
}

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
        <div
          style={{
            borderRight: `1px solid ${T.rule2}`,
            paddingRight: u(22),
            display: 'flex',
            flexDirection: 'column',
            gap: u(18),
            overflow: 'hidden',
          }}
        >
          {/* Clock */}
          <div>
            <Kicker>Today</Kicker>
            <div style={{ marginTop: u(6) }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: u(6) }}>
                <Num size="lg" value={clock.timeHM} unit={clock.timeSec} style={{ alignItems: 'baseline' }} />
                {clock.amPm && (
                  <span style={{ fontFamily: T.num, fontSize: u(16), color: T.ink2, lineHeight: 1 }}>
                    {clock.amPm}
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(13), color: T.ink2, marginTop: u(4) }}>
              {clock.dayStr}
            </div>
          </div>
          <Rule dash />
          {/* On This Day */}
          <OnThisDay />
          <Rule dash />
          {/* Weather */}
          <Weather weather={weather} prefs={prefs} />
          <Rule dash />
          {/* System */}
          <div>
            <Kicker>System</Kicker>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                rowGap: u(5),
                columnGap: u(12),
                marginTop: u(8),
              }}
            >
              {sys.map((s, i) => (
                <React.Fragment key={i}>
                  <span style={{ fontFamily: T.num, fontSize: u(12), color: T.ink2 }}>
                    <StatusDot state={s.state} />
                    {s.k}
                  </span>
                  <span style={{ fontFamily: T.num, fontSize: u(10), color: s.state === 'stale' ? T.orange : s.state === 'down' ? T.red : T.ink3, textAlign: 'right' }}>
                    {s.d}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontFamily: T.body,
              fontStyle: 'italic',
              fontSize: u(10),
              color: T.ink3,
              borderTop: `1px solid ${T.rule2}`,
              paddingTop: u(8),
            }}
          >
            Published from a home on the internet. Set in Playfair Display &amp; Newsreader.
          </div>
        </div>
        </ErrorBoundary>

        {/* COL 1 — MARKETS + LEAD STORY */}
        <ErrorBoundary label="Markets">
        <div
          style={{
            borderRight: `1px solid ${T.rule2}`,
            paddingRight: u(24),
            display: 'flex',
            flexDirection: 'column',
            gap: u(13),
            overflow: 'hidden',
          }}
        >
          <ProofOfRead
            btc={btc}
            chain={chain}
            hashrate={hashrate}
            mempoolTx={mempoolTx}
            mempoolMB={mempoolMB}
            feeFast={feeFast}
            feeEco={feeEco}
            btcPrice={btcPrice}
            btcLo={btcLo}
            btcHi={btcHi}
          />
          <Kicker>Markets · BTC / USD</Kicker>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Num size="hero" value={btcPrice} />
            <div style={{ fontFamily: T.num, fontSize: u(22), fontWeight: 400, color: btcUp ? T.green : T.red, paddingBottom: u(10), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
              {btcUp ? '▲' : '▼'} {btcChgPct}%
            </div>
          </div>
          {btc.data?.ath && (
            <div style={{ fontFamily: T.num, fontSize: u(10), color: T.ink4, marginTop: u(-8), marginBottom: u(2) }}>
              {'ATH $' + Math.round(btc.data.ath).toLocaleString() + (btc.data.athDate ? ' · ' + new Date(btc.data.athDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '') + ' · '}
              <span style={{ color: athAtNew ? T.green : T.red }}>{athAtNew ? '▲ new ATH' : ('▼ ' + Math.abs(athPct).toFixed(1) + '%')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(11), borderTop: `1px solid ${T.rule2}`, borderBottom: `1px solid ${T.rule2}`, padding: `${u(5)} 0`, marginBottom: u(6), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            <span style={{ color: T.green }}>hi ${btcHi}</span>
            <span style={{ color: T.ink3 }}>·</span>
            <span style={{ color: T.red }}>lo ${btcLo}</span>
            <span style={{ color: T.ink3 }}>·</span>
            <span style={{ color: btcUp ? T.green : T.red }}>cap {btcCap}</span>
            <span style={{ color: T.ink3 }}>·</span>
            <span style={{ color: T.ink3 }}>vol {btcVol}</span>
            <span style={{ color: T.ink3 }}>·</span>
            <span style={{ color: T.orange }}>
              {btc.data ? fmtNum(Math.round(1e8 / btc.data.price)) : '—'} sat/$
            </span>
          </div>
          {/* LineChart: parent div provides CSS dimensions, chart fills it */}
          <div style={{ width: '100%', height: u(110), flexShrink: 0 }}>
            <LineChart color={T.orange} points={btc.chartPts} vwap={btc.data?.vwap} fill historyPoints={priceHistory.data} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(10), color: T.ink3 }}>
            <span>24h ago</span><span>−18h</span><span>−12h</span><span>−6h</span><span>now</span>
          </div>
          <Rule dash />
          {/* Lead story */}
          {lead ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u(8), overflow: 'hidden', minHeight: 0, borderLeft: lead.topic === 'BREAKING' ? `${u(3)} solid ${T.red}` : 'none', paddingLeft: lead.topic === 'BREAKING' ? u(10) : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Kicker color={lead.topic === 'BREAKING' ? T.red : T.orange}>
                  {lead.topic === 'BREAKING' ? 'BREAKING' : `● ${lead.cat}`} · {lead.src}
                </Kicker>
                <Kicker color={isFresh(lead.t) ? T.orange : undefined}>{lead.t}</Kicker>
              </div>
              <a href={lead.link} target="_blank" rel="noopener noreferrer">
                <h1 style={{ fontFamily: T.serif, fontSize: u(32), fontWeight: 700, lineHeight: 1.04, letterSpacing: u(-1), color: T.ink, textWrap: 'balance', margin: 0 }}>
                  {lead.hed}
                </h1>
              </a>
              {lead.img ? <LeadImage src={lead.img} domain={lead.src} /> : null}
              {lead.snippet ? (
                <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, fontFamily: T.body, fontSize: u(13.5), lineHeight: 1.5, color: T.ink2 }}>
                  <span style={{ fontFamily: T.serif, fontSize: u(44), fontWeight: 700, color: T.ink, float: 'left', lineHeight: 0.88, marginRight: u(8), marginTop: u(3) }}>
                    {lead.snippet.charAt(0)}
                  </span>
                  {lead.snippet.slice(1)}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Kicker color={T.orange}>● {rss.err ? 'RSS unavailable' : 'Loading feed…'}</Kicker>
              <h1 style={{ fontFamily: T.serif, fontSize: u(32), fontWeight: 700, lineHeight: 1.04, letterSpacing: u(-1), color: T.ink4, margin: 0 }}>
                {rss.err ? 'All feeds unavailable' : 'Fetching headlines…'}
              </h1>
            </>
          )}
        </div>
        </ErrorBoundary>

        {/* COL 2 — HEADLINES FEED */}
        <ErrorBoundary label="News">
        {(() => {
          const NEWS_SECTIONS = ['BREAKING', 'MARKETS', 'MINING', 'REGULATION', 'TECH', 'GLOBAL', 'BITCOIN'];
          const grouped = NEWS_SECTIONS.reduce((acc, topic) => {
            const group = newsItems.filter(it => it.topic === topic);
            if (group.length > 0) acc.push({ topic, group });
            return acc;
          }, []);
          return (
            <div style={{ borderRight: `1px solid ${T.rule2}`, paddingRight: u(24), overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Kicker>Bitcoin news</Kicker>
                {rss.err && <Kicker color={T.red}>feed error</Kicker>}
              </div>
              <div className={`news-col-wrap${newsItems.length < 8 ? ' at-bottom' : ''}`} style={{ marginTop: u(8), flex: 1, minHeight: 0 }}>
                <div
                  className="news-scroll"
                  style={{ height: '100%', overflowY: 'auto' }}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const wrap = el.parentElement;
                    el.classList.add('is-scrolling');
                    clearTimeout(wrap._st);
                    wrap._st = setTimeout(() => el.classList.remove('is-scrolling'), 1200);
                    wrap.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 4);
                  }}
                >
                  {newsItems.length > 0 ? grouped.map(({ topic, group }) => (
                    <React.Fragment key={topic}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: u(10), padding: `${u(10)} 0 ${u(6)}` }}>
                        <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
                        <span style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(2.5), textTransform: 'uppercase', color: T.ink4 }}>{topic}</span>
                        <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
                      </div>
                      {group.map((it, i) => (
                        <a
                          key={it.link || i}
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            padding: `${u(8)} 0`,
                            borderBottom: `1px solid ${T.rule3}`,
                            borderLeft: it.topic === 'BREAKING' ? `${u(3)} solid ${T.red}` : 'none',
                            paddingLeft: it.topic === 'BREAKING' ? u(10) : 0,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: u(4) }}>
                            <Kicker color={it.topic === 'BREAKING' ? T.red : T.ink3}>{it.cat}</Kicker>
                            <span style={{ fontFamily: T.num, fontSize: u(10), color: isFresh(it.t) ? T.orange : T.ink3 }}>{it.t}</span>
                          </div>
                          <div style={{ fontFamily: T.body, fontSize: u(14.5), lineHeight: 1.3, color: T.ink, letterSpacing: u(-0.1) }}>
                            {it.hed}
                          </div>
                          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(2) }}>
                            {it.src}
                          </div>
                        </a>
                      ))}
                    </React.Fragment>
                  )) : (
                    <div style={{ fontFamily: T.num, fontSize: u(12), color: T.ink3, marginTop: u(16) }}>
                      {rss.err ? 'All feeds unavailable' : 'Loading headlines…'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
        </ErrorBoundary>

        {/* COL 3 — FIELD REPORT + CHAIN VITALS */}
        <ErrorBoundary label="Network">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
          <Miners bitaxe={bitaxe} chain={chain} />
          <div className="news-col-wrap" style={{ marginTop: u(32), flexShrink: 1, minHeight: 0 }}>
            <div
              className="no-scrollbar"
              style={{ height: '100%', overflowY: 'auto' }}
              onScroll={(e) => {
                const el = e.currentTarget;
                el.parentElement.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 4);
              }}
            >
              <NetworkStatusWidget chain={chain} T={T} />
            </div>
          </div>
        </div>
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
