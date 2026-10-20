import React from 'react';
import ReactDOM from 'react-dom/client';
import { useClock } from './hooks/useClock.js';
import { useBTC } from './hooks/useBTC.js';
import { useChain } from './hooks/useChain.js';
import { useBitaxe } from './hooks/useBitaxe.js';
import { useWeather } from './hooks/useWeather.js';
import { useRSS } from './hooks/useRSS.js';
import { useChartRange } from './hooks/useChartRange.js';
import { useFeedHealth } from './hooks/useFeedHealth.js';
import { usePageRefresh } from './hooks/usePageRefresh.js';
import { useViewportMode } from './hooks/useViewportMode.js';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { CommandCenter } from './components/CommandCenter.jsx';
import { MobileApp } from './components/mobile/MobileApp.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import CONFIG from './config.js';
import { LIGHT, DARK, ThemeCtx } from './theme.js';
import { loadV2Prefs, saveV2Prefs } from './utils/v2prefs.js';
import { resolveRange, withRange } from './utils/chartRange.js';
import { RSS_FEED_MAP } from './config.js';

const MIN_INTERVAL_MS = 5_000;
const toMs = v => { const ms = Number(v) * 1000; return Number.isFinite(ms) && ms > 0 ? Math.max(MIN_INTERVAL_MS, ms) : MIN_INTERVAL_MS; };

function applyV2ToConfig(p) {
  CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] ?? f.on).map(({ key, url }) => ({ key, url }));
  CONFIG.REFRESH_INTERVALS.price   = toMs(p.intervals.price);
  CONFIG.REFRESH_INTERVALS.chain   = toMs(p.intervals.chain);
  CONFIG.REFRESH_INTERVALS.weather = toMs(p.intervals.weather);
  CONFIG.REFRESH_INTERVALS.news    = toMs(p.intervals.rss);
  CONFIG.REFRESH_INTERVALS.bitaxe  = toMs(p.intervals.bitaxe);
  // Running hooks capture their interval on mount; changes take effect on next reload.
}

function App() {
  // ─── Dark Mode ────────────────────────────────────────────
  const [dark, setDark] = React.useState(() => loadV2Prefs().theme === 'dark');

  // ─── Settings Panel ───────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // ─── One-time migration: remove deprecated BitAxe localStorage key ──
  // Guarded by a marker so it only runs once per browser. Safe to delete
  // this block entirely after 2026-08-01 — every active user will have
  // migrated by then.
  React.useEffect(() => {
    try {
      if (localStorage.getItem('dailynode-bitaxe-migrated') === '1') return;
      localStorage.removeItem('dailynode-bitaxe');
      localStorage.setItem('dailynode-bitaxe-migrated', '1');
    } catch {}
  }, []);

  // ─── User Preferences (with localStorage persistence) ──────
  const loadSavedPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem('dailynode-prefs') || '{}');
    } catch {
      return {};
    }
  };
  const [prefs, setPrefs] = React.useState(() => {
    const s = loadSavedPrefs();
    return {
      lat: s.lat ?? CONFIG.WEATHER_LAT,
      lng: s.lng ?? CONFIG.WEATHER_LNG,
      cityName: s.cityName ?? '',
      timeFormat: s.timeFormat ?? '12h',
      tempUnit: s.tempUnit ?? 'fahrenheit',
    };
  });

  // ─── v2 Prefs (alerts, feeds, intervals, theme) ───────────────
  const [v2prefs, setV2Prefs] = React.useState(() => {
    const p = loadV2Prefs();
    applyV2ToConfig(p);
    return p;
  });

  // ─── Call All Hooks ───────────────────────────────────────
  const clock = useClock(prefs.timeFormat);
  const btc = useBTC();
  const chain = useChain(v2prefs.mempool);
  const bitaxe = useBitaxe();
  const weather = useWeather(prefs.lat, prefs.lng, prefs.tempUnit);
  const rss = useRSS();
  const range = resolveRange(v2prefs);
  const chart = useChartRange(range);
  const feedHealth = useFeedHealth([btc, { ...chain, contentStale: chain.stale }, weather, rss, bitaxe]);

  // ─── Auto-Refresh (tab refocus + network restore) ─────────
  usePageRefresh([btc.refresh, chain.refresh, rss.refresh, weather.refresh, bitaxe.refresh, chart.refresh]);

  // ─── Viewport Mode ────────────────────────────────────────
  // SYNC: 900 must match the isMobile check in updateScale() and
  // @media (max-width:900px), both in src/index.html
  const mode = useViewportMode(900);

  // ─── Theme Selection ──────────────────────────────────────
  const theme = dark ? DARK : LIGHT;

  // ─── Effects ──────────────────────────────────────────────
  React.useEffect(() => {
    document.documentElement.style.setProperty('--paper', dark ? DARK.paper : LIGHT.paper);
    document.body.style.background = dark ? DARK.paper : LIGHT.paper;
  }, [dark]);

  // ─── Event Handlers ───────────────────────────────────────
  const handleToggleDark = () => setDark(prev => !prev);

  const handleSaveV2Prefs = React.useCallback((newPrefs) => {
    saveV2Prefs(newPrefs);
    setV2Prefs(newPrefs);
    applyV2ToConfig(newPrefs);
    if (newPrefs.theme === 'dark')  setDark(true);
    if (newPrefs.theme === 'light') setDark(false);
  }, []);

  // Saves prefs only. Unlike handleSaveV2Prefs it must not re-apply the stored
  // theme, or a range click would undo a manual Masthead dark/light toggle.
  const handleRangeChange = React.useCallback((key) => {
    const next = withRange(v2prefs, key);
    saveV2Prefs(next);
    setV2Prefs(next);
  }, [v2prefs]);

  const handleSaveSettings = (newPrefs) => {
    setPrefs(newPrefs);
    localStorage.setItem('dailynode-prefs', JSON.stringify(newPrefs));
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <ThemeCtx.Provider value={theme}>
      <ErrorBoundary label="Dashboard">
      {mode === 'mobile'
        ? <MobileApp
            prefs={prefs}
            v2prefs={v2prefs}
            clock={clock}
            btc={btc}
            chain={chain}
            bitaxe={bitaxe}
            weather={weather}
            rss={rss}
            feedHealth={feedHealth}
            chart={chart}
            range={range}
            onRangeChange={handleRangeChange}
            dark={dark}
            onToggleDark={handleToggleDark}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        : <CommandCenter
            dark={dark}
            onToggleDark={handleToggleDark}
            prefs={prefs}
            v2prefs={v2prefs}
            settingsOpen={settingsOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onSaveSettings={handleSaveSettings}
            onSaveV2={handleSaveV2Prefs}
            onCloseSettings={() => setSettingsOpen(false)}
            clock={clock}
            btc={btc}
            chain={chain}
            bitaxe={bitaxe}
            weather={weather}
            rss={rss}
            feedHealth={feedHealth}
            chart={chart}
            range={range}
            onRangeChange={handleRangeChange}
          />
      }
      </ErrorBoundary>
      {mode === 'mobile' && settingsOpen && (
        // Fixed, because #stage is the mobile page's scroller and an absolute
        // panel would scroll away with it; 60 sits above MobileTabBar's 50.
        // Its edges sit on the safe-area insets rather than padding, because
        // SettingsPanel's absolute inset: 0 fills the padding box anyway.
        <div style={{
          position: 'fixed', zIndex: 60,
          top: 'env(safe-area-inset-top, 0px)',
          right: 'env(safe-area-inset-right, 0px)',
          bottom: 'env(safe-area-inset-bottom, 0px)',
          left: 'env(safe-area-inset-left, 0px)',
        }}>
          <SettingsPanel
            prefs={prefs}
            v2prefs={v2prefs}
            miners={bitaxe.miners}
            onRefresh={bitaxe.refresh}
            onSave={handleSaveSettings}
            onSaveV2={handleSaveV2Prefs}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
    </ThemeCtx.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('canvas'));
root.render(<App />);
