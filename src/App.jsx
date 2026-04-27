import React from 'react';
import ReactDOM from 'react-dom/client';
import { useClock } from './hooks/useClock.js';
import { useBTC } from './hooks/useBTC.js';
import { useChain } from './hooks/useChain.js';
import { useBitaxe } from './hooks/useBitaxe.js';
import { useWeather } from './hooks/useWeather.js';
import { useRSS } from './hooks/useRSS.js';
import { useFeedHealth } from './hooks/useFeedHealth.js';
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

  // ─── Call All Hooks ───────────────────────────────────────
  const clock = useClock(prefs.timeFormat);
  const btc = useBTC();
  const chain = useChain();
  const bitaxe = useBitaxe(bitaxeApiUrl, bitaxeIps);
  const weather = useWeather(prefs.lat, prefs.lng, prefs.tempUnit);
  const rss = useRSS();
  const feedHealth = useFeedHealth([btc, chain, weather, rss]);

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
      <CommandCenter
        dark={dark}
        onToggleDark={handleToggleDark}
        bitaxeApiUrl={bitaxeApiUrl}
        bitaxeIps={bitaxeIps}
        prefs={prefs}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onSaveSettings={handleSaveSettings}
        onCloseSettings={() => setSettingsOpen(false)}
        clock={clock}
        btc={btc}
        chain={chain}
        bitaxe={bitaxe}
        weather={weather}
        rss={rss}
        feedHealth={feedHealth}
      />
    </ThemeCtx.Provider>
  );
}

// ─── Mount to DOM ──────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('canvas'));
root.render(<App />);
