import React from 'react';
import { useT } from '../theme';
import { Masthead } from './Masthead';
import { MastheadPanel } from './MastheadPanel';
import { Rule } from './Rule';
import { Kicker } from './Kicker';
import { OnThisDay } from './OnThisDay';
import { ProofOfRead } from './ProofOfRead';
import { Num } from './Num';
import { StatusDot } from './StatusDot';
import { WxGlyph } from './WxGlyph';
import { LineChart } from './LineChart';
import { NetworkStatusWidget } from './NetworkStatusWidget';
import Miners from './Miners';
import {
  useClock,
  useBTC,
  useChain,
  useBitaxe,
  useWeather,
  useRSS,
  useFeedHealth,
} from '../hooks';
import {
  INTERVALS,
  fmtPrice,
  fmtPct,
  fmtNum,
  fmtVolUsd,
  fmtHashrate,
  fmtDiff,
  fmtMempoolMB,
  fmtBlockTime,
  fmtBlockSize,
  fmtBestDiff,
  timeAgoUnix,
  calcSoloOdds,
  fmtHour,
  wmoIcon,
  wmoDesc,
  wmoSpeed,
  timeAgo,
} from '../utils';


/**
 * CommandCenter — Main layout orchestrator
 * Renders a responsive 4-column newspaper dashboard on desktop/TV,
 * and a single-column scrollable view on mobile (< 900px).
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

export function CommandCenter({
  dark,
  onToggleDark,
  bitaxeApiUrl,
  bitaxeIps,
  prefs,
  settingsOpen,
  onOpenSettings,
  onSaveSettings,
  onCloseSettings,
}) {
  const T = useT();
  const { isMobile } = useLayoutSize();
  const clock = useClock(prefs.timeFormat);
  const btc = useBTC();
  const chain = useChain();
  const bitaxe = useBitaxe(bitaxeApiUrl, bitaxeIps);
  const weather = useWeather(prefs.lat, prefs.lng, prefs.tempUnit);
  const rss = useRSS();

  const autoThemeDone = React.useRef(false);
  React.useEffect(() => {
    if (autoThemeDone.current) return;
    const wx = weather.data;
    if (!wx?.wxSunriseHr && wx?.wxSunriseHr !== 0) return;
    const hr = new Date().getHours();
    const shouldBeDark = hr < wx.wxSunriseHr || hr >= wx.wxSunsetHr;
    if (shouldBeDark !== dark) onToggleDark();
    autoThemeDone.current = true;
  }, [weather.data?.wxSunriseHr]);

  const feedHealth = useFeedHealth([
    { lastOk: btc.lastOk, interval: INTERVALS.BTC },
    { lastOk: chain.lastOk, interval: INTERVALS.CHAIN },
    { lastOk: bitaxe.lastOk, interval: INTERVALS.BITAXE },
    { lastOk: weather.lastOk, interval: INTERVALS.WEATHER },
    { lastOk: rss.lastOk, interval: INTERVALS.RSS },
  ]);

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
  const retargetDate = chain.data?.estimatedRetargetDate
    ? new Date(chain.data.estimatedRetargetDate).toISOString().slice(0, 10)
    : '—';
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

  const miningRows = [
    { k: 'Hashrate', v: hashrate },
    { k: 'Difficulty', v: difficulty },
    { k: 'Avg block', v: chain.data?.blockTimeMs ? fmtBlockTime(chain.data.blockTimeMs) : '—', c: blockTimeCol },
    { k: 'Diff retarget', v: diffAdjStr, c: diffAdjCol },
    { k: 'Retarget in', v: chain.data?.remainingBlocks != null ? `${fmtNum(chain.data.remainingBlocks)} blk` : '—' },
    { k: 'Retarget date', v: retargetDate },
    { k: 'Epoch', v: epochStr },
  ];
  const chainStatRows = [
    { k: 'Block height', v: blockHeight },
    { k: 'Circulating', v: chain.data ? chain.data.circulating : '—' },
    { k: 'Next halving', v: chain.data ? chain.data.nextHalvingDate : '—' },
  ];
  const mempoolRows = [
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

  const sys = [
    { k: 'miners', v: bitaxe.err ? 'err' : onlineCount > 0 ? 'ok' : bitaxe.loading ? '…' : 'err', d: bitaxe.loading ? 'connecting' : `${onlineCount}/${minerCount} online` },
    { k: 'mempool', v: chain.err ? 'err' : chain.data ? 'ok' : '…', d: chain.data ? `${mempoolMB}` : '—' },
    { k: 'kraken', v: btc.err ? 'err' : btc.data ? 'ok' : '…', d: btc.data ? `${btcChgPct}% 24h` : '—' },
    { k: 'weather', v: weather.err ? 'err' : weather.data ? 'ok' : '…', d: weather.data ? weather.data.wxCond.toLowerCase() : '—' },
    { k: 'rss', v: rss.err ? 'err' : rss.items.length > 0 ? 'ok' : '…', d: rss.items.length > 0 ? `${rss.items.length} stories` : '—' },
  ];

  const wx = weather.data;
  const lead = rss.leadStory;
  const newsItems = rss.items;
  const tempUnitLabel = prefs.tempUnit === 'celsius' ? '°C' : '°F';
  const wxSummary = wx ? `${wx.temp}${tempUnitLabel} ${wx.wxCond.toLowerCase()}` : `—${tempUnitLabel}`;

  // ── MOBILE LAYOUT ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        background: T.paper,
        color: T.ink,
        fontFamily: T.body,
      }}>
        {/* Mobile header */}
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${T.rule2}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}>
          <div>
            <div style={{ fontFamily: T.body, fontSize: 9, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 3 }}>
              Bitcoin Command Center
            </div>
            <div style={{ fontFamily: T.serif, fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
              The Daily Node
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <div style={{ fontFamily: T.num, fontSize: u(11), color: T.ink3 }}>
              {clock.timeHM}{clock.amPm ? ` ${clock.amPm}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onToggleDark}
                style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer', background: dark ? T.ink : 'none', color: dark ? T.paper : T.ink2, border: `1px solid ${dark ? T.ink : T.ink3}` }}
              >
                {dark ? '◑' : '◐'}
              </button>
              <button
                onClick={onOpenSettings}
                style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 10px', cursor: 'pointer', background: 'none', color: T.ink2, border: `1px solid ${T.ink3}` }}
              >
                ⚙
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 16px 48px' }}>
          {/* BTC Price */}
          <div style={{ paddingTop: 16, paddingBottom: 16, borderBottom: `1px solid ${T.rule2}` }}>
            <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
              Markets · BTC / USD
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 4 }}>
              <div style={{ fontFamily: T.numDisplay, fontSize: u(42), fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: T.ink, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                {btcPrice}
              </div>
              <div style={{ fontFamily: T.num, fontSize: u(18), fontWeight: 400, color: btcUp ? T.green : T.red, paddingBottom: 4, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                {btcUp ? '▲' : '▼'} {btcChgPct}%
              </div>
            </div>
            <div style={{ fontFamily: T.num, fontSize: u(11), color: T.ink3, marginBottom: u(12), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
              Hi ${btcHi} · Lo ${btcLo} · Cap {btcCap}
            </div>
            {/* Chart */}
            <div style={{ height: 80, marginBottom: 4 }}>
              <LineChart color={T.orange} points={btc.chartPts} vwap={btc.data?.vwap} fill />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(9), color: T.ink4 }}>
              <span>24h ago</span><span>−12h</span><span>now</span>
            </div>
          </div>

          {/* Weather */}
          {wx && (
            <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: `1px solid ${T.rule2}` }}>
              <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
                Weather
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <WxGlyph kind={wmoIcon(wx.wxCode, new Date().getHours(), wx.wxWindSpeed, wx.wxSunriseHr, wx.wxSunsetHr)} size={48} speed={wmoSpeed(wx.wxCode, wx.wxWindSpeed)} />
                <div>
                  <div style={{ fontFamily: T.num, fontSize: u(32), fontWeight: 400, letterSpacing: -1, color: T.ink, lineHeight: 1 }}>
                    {wx.temp}° <span style={{ fontSize: u(16), color: T.ink3 }}>{prefs.tempUnit === 'celsius' ? 'C' : 'F'}</span>
                  </div>
                  <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(13), color: T.ink2, marginTop: u(3) }}>
                    {wx.wxCond} · H{wx.wxHi} L{wx.wxLo}
                  </div>
                  <div style={{ fontFamily: T.num, fontSize: u(11), color: T.ink3, marginTop: u(2) }}>
                    {wx.wxWind} · {wx.wxHum} humidity
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Network */}
          <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: `1px solid ${T.rule2}` }}>
            <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
              Network
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {[
                { val: hashrate,    label: 'Hashrate' },
                { val: difficulty,  label: 'Difficulty' },
                { val: chain.data ? `${(chain.data.blockTimeMs / 60000).toFixed(1)}m` : '—', label: 'Block Time', color: blockTimeCol },
                { val: mempoolMB,   label: 'Mempool', color: mempoolCol },
              ].map(({ val, label, color }, i) => (
                <div key={i}>
                  <div style={{ fontFamily: T.num, fontSize: u(18), fontWeight: 400, color: color || T.ink, lineHeight: 1, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                    {val}
                  </div>
                  <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3, marginTop: 3 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fleet */}
          <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: `1px solid ${T.rule2}` }}>
            <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
              Fleet
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {[
                { val: `${onlineCount}/${minerCount}`,   label: 'Online' },
                { val: totalHashrateTHS > 0 ? `${totalHashrateTHS.toFixed(2)} TH/s` : '—', label: 'Hashrate' },
                { val: totalPower > 0 ? `${(totalPower / 1000).toFixed(1)} kW` : '—', label: 'Power' },
                { val: soloOdds ? `1:${fmtNum(soloOdds.oddsPerDay)}/d` : '—', label: 'Solo Odds' },
              ].map(({ val, label }, i) => (
                <div key={i}>
                  <div style={{ fontFamily: T.num, fontSize: u(18), fontWeight: 400, color: T.ink, lineHeight: 1, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
                    {val}
                  </div>
                  <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: T.ink3, marginTop: 3 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lead story */}
          {lead && (
            <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: `1px solid ${T.rule2}` }}>
              <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.orange, marginBottom: 8 }}>
                ● {lead.cat} · {lead.src}
              </div>
              <a href={lead.link} target="_blank" rel="noopener noreferrer">
                <h2 style={{ fontFamily: T.serif, fontSize: 24, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.5, color: T.ink, margin: 0 }}>
                  {lead.hed}
                </h2>
              </a>
            </div>
          )}

          {/* Headlines */}
          <div style={{ paddingTop: 14 }}>
            <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
              Bitcoin News
            </div>
            {newsItems.length === 0 ? (
              <div style={{ fontFamily: T.num, fontSize: u(12), color: T.ink3 }}>
                {rss.err ? 'Feed unavailable' : 'Loading…'}
              </div>
            ) : newsItems.slice(0, 20).map((it, i) => (
              <a
                key={it.link || i}
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '10px 0',
                  borderBottom: `1px solid ${T.rule3}`,
                  borderLeft: it.topic === 'BREAKING' ? `3px solid ${T.red}` : 'none',
                  paddingLeft: it.topic === 'BREAKING' ? 10 : 0,
                }}
              >
                <div style={{ fontFamily: T.body, fontSize: 15, lineHeight: 1.3, color: T.ink, letterSpacing: -0.1 }}>
                  {it.hed}
                </div>
                <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: 11, color: T.ink3, marginTop: 3 }}>
                  {it.src} · {it.t}
                </div>
              </a>
            ))}
          </div>
        </div>

        {settingsOpen && (
          <MastheadPanel
            apiUrl={bitaxeApiUrl}
            ips={bitaxeIps}
            prefs={prefs}
            onSave={onSaveSettings}
            onClose={onCloseSettings}
          />
        )}
      </div>
    );
  }

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
                gridTemplateColumns: '1fr auto auto',
                rowGap: u(5),
                columnGap: u(12),
                marginTop: u(8),
              }}
            >
              {sys.map((s, i) => (
                <React.Fragment key={i}>
                  <span style={{ fontFamily: T.num, fontSize: u(12), color: T.ink2 }}>
                    <StatusDot ok={s.v === 'ok'} />
                    {s.k}
                  </span>
                  <Num size="xs" value={s.v} style={{ justifyContent: 'flex-end' }} />
                  <span style={{ fontFamily: T.num, fontSize: u(10), color: T.ink3, textAlign: 'right' }}>
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

        {/* COL 1 — MARKETS + LEAD STORY */}
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
            <LineChart color={T.orange} points={btc.chartPts} vwap={btc.data?.vwap} fill />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(10), color: T.ink3 }}>
            <span>24h ago</span><span>−18h</span><span>−12h</span><span>−6h</span><span>now</span>
          </div>
          <Rule dash />
          {/* Lead story */}
          {lead ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u(8), overflow: 'hidden', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Kicker color={T.orange}>● {lead.cat} · {lead.src}</Kicker>
                <Kicker>{lead.t}</Kicker>
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

        {/* COL 2 — HEADLINES FEED */}
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
                            <span style={{ fontFamily: T.num, fontSize: u(10), color: T.ink3 }}>{it.t}</span>
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

        {/* COL 3 — FIELD REPORT + CHAIN VITALS */}
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
      </div>

      {settingsOpen && (
        <MastheadPanel
          apiUrl={bitaxeApiUrl}
          ips={bitaxeIps}
          prefs={prefs}
          onSave={onSaveSettings}
          onClose={onCloseSettings}
        />
      )}
    </div>
  );
}
