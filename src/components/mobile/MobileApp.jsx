import React from 'react';
import { useT } from '../../theme.js';
import { themeFlipDecision } from '../../utils/autoTheme.js';
import { MobileHeader } from './MobileHeader.jsx';
import { MobileTabBar } from './MobileTabBar.jsx';
import { HomePanel } from './HomePanel.jsx';
import { BitcoinPanel } from './BitcoinPanel.jsx';
import { NewsPanel } from './NewsPanel.jsx';

function MobileApp(props) {
  const T = useT();
  const [activeTab, setActiveTab] = React.useState('home');

  const {
    clock, btc, chain, bitaxe, weather, rss, feedHealth,
    prefs, v2prefs, dark, onToggleDark, onOpenSettings,
  } = props;

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
    <div style={{
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
      {activeTab === 'news' && (
        <NewsPanel rss={rss} />
      )}

      <MobileTabBar activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

MobileApp = React.memo(MobileApp);

export { MobileApp };
