import React from 'react';
import ReactDOM from 'react-dom/client';
import { useClock } from './hooks/useClock.js';
import { useBTC } from './hooks/useBTC.js';
import { useChain } from './hooks/useChain.js';
import { useBitaxe } from './hooks/useBitaxe.js';
import { useWeather } from './hooks/useWeather.js';
import { useRSS } from './hooks/useRSS.js';
import { useFeedHealth } from './hooks/useFeedHealth.js';
import { usePageRefresh } from './hooks/usePageRefresh.js';
import { CommandCenter } from './components/CommandCenter.jsx';
import CONFIG from './config.js';
import { LIGHT, DARK, ThemeCtx } from './theme.js';

function App() {
  // ─── Dark Mode ────────────────────────────────────────────
  const [dark, setDark] = React.useState(false);

  // ─── Settings Panel ───────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // ─── One-time migration: remove deprecated BitAxe localStorage key ──
  React.useEffect(() => {
    try { localStorage.removeItem('dailynode-bitaxe'); } catch {}
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
    CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] !== false).map(f => f.url);
    CONFIG.REFRESH_INTERVALS.price   = p.intervals.price   * 1000;
    CONFIG.REFRESH_INTERVALS.chain   = p.intervals.chain   * 1000;
    CONFIG.REFRESH_INTERVALS.weather = p.intervals.weather * 1000;
    CONFIG.REFRESH_INTERVALS.news    = p.intervals.rss     * 1000;
    CONFIG.REFRESH_INTERVALS.bitaxe  = p.intervals.bitaxe  * 1000;
    return p;
  });

  // ─── Call All Hooks ───────────────────────────────────────
  const clock = useClock(prefs.timeFormat);
  const btc = useBTC();
  const chain = useChain();
  const bitaxe = useBitaxe();
  const weather = useWeather(prefs.lat, prefs.lng, prefs.tempUnit);
  const rss = useRSS();
  const feedHealth = useFeedHealth([btc, chain, weather, rss, bitaxe]);

  // ─── Auto-Refresh (tab refocus + network restore) ─────────
  usePageRefresh([btc.refresh, chain.refresh, rss.refresh, weather.refresh, bitaxe.refresh]);

  // ─── Viewport Mode ────────────────────────────────────────
  const mode = useViewportMode();

  // ─── Theme Selection ──────────────────────────────────────
  const theme = dark ? DARK : LIGHT;

  // ─── Effects ──────────────────────────────────────────────
  React.useEffect(() => {
    if (window.applyScale) window.applyScale();
  }, []);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--paper', dark ? DARK.paper : LIGHT.paper);
  }, [dark]);

  // ─── Event Handlers ───────────────────────────────────────
  const handleToggleDark = () => {
    setDark(prev => {
      const next = !prev;
      document.body.style.background = next ? DARK.paper : LIGHT.paper;
      document.documentElement.style.setProperty('--paper', next ? DARK.paper : LIGHT.paper);
      return next;
    });
  };

  const handleSaveV2Prefs = React.useCallback((newPrefs) => {
    saveV2Prefs(newPrefs);
    setV2Prefs(newPrefs);
    CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => newPrefs.feeds[f.key] !== false).map(f => f.url);
    if (newPrefs.theme === 'dark')  setDark(true);
    if (newPrefs.theme === 'light') setDark(false);
  }, []);

  const handleSaveSettings = (newPrefs) => {
    setPrefs(newPrefs);
    localStorage.setItem('dailynode-prefs', JSON.stringify(newPrefs));
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <ThemeCtx.Provider value={theme}>
      {mode === 'mobile'
        ? <MobileLayout
            btc={btc}
            chain={chain}
            miners={bitaxe}
            news={rss}
            onToggleDark={handleToggleDark}
            dark={dark}
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
          />
      }
    </ThemeCtx.Provider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('canvas'));
root.render(<App />);
