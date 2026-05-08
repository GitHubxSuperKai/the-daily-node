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

/**
 * App - Root React Component
 *
 * Orchestrates all hooks and manages global app state:
 * - Dark mode toggle
 * - Settings panel visibility
 * - User preferences (location, time format, temp unit)
 *
 * Renders CommandCenter with all data passed as props.
 */
function App() {
  // ─── Dark Mode ────────────────────────────────────────────
  const [dark, setDark] = React.useState(false);

  // ─── Settings Panel ───────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [tweaksPanelOpen, setTweaksPanelOpen] = React.useState(false);

  // ─── BitAxe Configuration (with localStorage persistence) ──
  const loadSavedBitAxe = () => {
    try {
      return JSON.parse(localStorage.getItem('dailynode-bitaxe') || '{}');
    } catch {
      return {};
    }
  };
  const [bitaxeApiUrl, setBitaxeApiUrl] = React.useState(() => {
    const s = loadSavedBitAxe();
    return s.apiUrl !== undefined ? s.apiUrl : CONFIG.BITAXE_API_URL;
  });
  const [bitaxeIps, setBitaxeIps] = React.useState(() => {
    const s = loadSavedBitAxe();
    return s.ips !== undefined ? s.ips : CONFIG.BITAXE_IPS;
  });

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
    // Patch CONFIG.RSS_FEEDS so useRSS() reads the correct feed list on first mount
    CONFIG.RSS_FEEDS = RSS_FEED_MAP.filter(f => p.feeds[f.key] !== false).map(f => f.url);
    // Patch CONFIG.REFRESH_INTERVALS (seconds → ms) so hooks pick up user values on first mount
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
  const bitaxe = useBitaxe(bitaxeApiUrl, bitaxeIps);
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
  // Apply canvas scaling if available
  React.useEffect(() => {
    if (window.applyScale) {
      window.applyScale();
    }
  }, []);

  // Apply theme to document
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
    // Interval changes take effect on next page reload (noted in TweaksPanel UI)
  }, []);

  const handleSaveSettings = (newApiUrl, newIps, newPrefs) => {
    setBitaxeApiUrl(newApiUrl);
    setBitaxeIps(newIps);
    localStorage.setItem('dailynode-bitaxe', JSON.stringify({ apiUrl: newApiUrl, ips: newIps }));
    setPrefs(newPrefs);
    localStorage.setItem('dailynode-prefs', JSON.stringify(newPrefs));
    setSettingsOpen(false);
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
            bitaxeApiUrl={bitaxeApiUrl}
            bitaxeIps={bitaxeIps}
            prefs={prefs}
            settingsOpen={settingsOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onSaveSettings={handleSaveSettings}
            onCloseSettings={() => setSettingsOpen(false)}
            tweaksPanelOpen={tweaksPanelOpen}
            onOpenTweaks={() => setTweaksPanelOpen(true)}
            onCloseTweaks={() => setTweaksPanelOpen(false)}
            onSaveTweaks={handleSaveV2Prefs}
            v2prefs={v2prefs}
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

// ─── Mount to DOM ──────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('canvas'));
root.render(<App />);
