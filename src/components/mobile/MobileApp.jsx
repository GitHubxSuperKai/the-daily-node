import React from 'react';
import { useT } from '../../theme.js';
import { themeFlipDecision } from '../../utils/autoTheme.js';
import { MobileHeader } from './MobileHeader.jsx';
import { MobileTabBar } from './MobileTabBar.jsx';
import { HomePanel } from './HomePanel.jsx';
import { BitcoinPanel } from './BitcoinPanel.jsx';
import { NewsPanel } from './NewsPanel.jsx';
import { MinersPanel } from './MinersPanel.jsx';

const TAB_ORDER = ['home', 'bitcoin', 'miners', 'news'];

function MobileApp(props) {
  const T = useT();
  const [activeTab, setActiveTab] = React.useState('home');

  const {
    clock, btc, chain, bitaxe, weather, rss, feedHealth,
    prefs, v2prefs, dark, onToggleDark, onOpenSettings,
  } = props;

  const touchStartRef = React.useRef(null);

  function onTouchStart(e) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e) {
    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < 0) return;
    if (dx < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
    if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  }

  const lastShouldBeDark = React.useRef(null);
  React.useEffect(() => {
    if (v2prefs?.theme !== 'auto') return;
    const wx = weather.data;
    if (wx?.wxSunriseHr == null) return;
    const hr = new Date().getHours();
    const shouldBeDark = hr < wx.wxSunriseHr || hr >= wx.wxSunsetHr;
    const { update, flip } = themeFlipDecision(lastShouldBeDark.current, shouldBeDark, dark);
    if (update) lastShouldBeDark.current = shouldBeDark;
    if (flip) onToggleDark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.timeHM, weather.data?.wxSunriseHr, dark, v2prefs?.theme]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: T.paper,
        color: T.ink,
        fontFamily: T.body,
      }}>
      <MobileHeader
        clock={clock}
        dark={dark}
        onToggleDark={onToggleDark}
        onOpenSettings={onOpenSettings}
      />

      {activeTab === 'home' && (
        <HomePanel
          clock={clock}
          btc={btc}
          chain={chain}
          bitaxe={bitaxe}
          weather={weather}
          rss={rss}
          feedHealth={feedHealth}
          prefs={prefs}
          onNavigate={setActiveTab}
        />
      )}
      {activeTab === 'bitcoin' && (
        <BitcoinPanel btc={btc} chain={chain} />
      )}
      {activeTab === 'miners' && (
        <MinersPanel bitaxe={bitaxe} />
      )}
      {activeTab === 'news' && (
        <NewsPanel rss={rss} />
      )}

      <MobileTabBar activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

MobileApp = React.memo(MobileApp);

export { MobileApp };
