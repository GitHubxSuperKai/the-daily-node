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
import { DesktopTicker } from './DesktopTicker';
import { SettingsPanel } from './SettingsPanel';
import {
  fmtPct,
  fmtMempoolMB,
} from '../utils/formatting.js';

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
  const btcChgPct = btc.data ? fmtPct(btc.data.chgPct) : '—';

  const halvings = chain.data ? Math.floor(chain.data.height / 210000) : null;
  const blockReward = halvings != null ? 50 / Math.pow(2, halvings) : null;
  const rewardEra = halvings != null ? halvings + 1 : null;
  const blockRewardStr = blockReward != null
    ? (blockReward >= 0.001 ? `${blockReward} BTC` : `${blockReward.toFixed(8)} BTC`)
    : null;
  const mempoolMB = chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—';

  // BitAxe fleet derived (for sys status panel)
  const onlineMiners = bitaxe.miners.filter((m) => m.online && m.data);
  const minerCount = bitaxe.miners.length;
  const onlineCount = onlineMiners.length;

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
        <DesktopTicker btc={btc} chain={chain} bitaxe={bitaxe} feedHealth={feedHealth} />
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
