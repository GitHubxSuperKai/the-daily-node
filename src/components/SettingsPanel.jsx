import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';
import { u } from '../utils/scale';
import { MinersSection } from './settings/MinersSection';
import { PreferencesSection } from './settings/PreferencesSection';
import { AlertsSection } from './settings/AlertsSection';
import { FeedsThemeSection } from './settings/FeedsThemeSection';
import { IntervalsDataSection } from './settings/IntervalsDataSection';

export function SettingsPanel({ prefs, v2prefs, miners, onRefresh, onSave, onSaveV2, onClose }) {
  const T = useT();

  const [pendingPrefs, setPendingPrefs] = React.useState({
    lat: prefs.lat, lng: prefs.lng, cityName: prefs.cityName,
    timeFormat: prefs.timeFormat, tempUnit: prefs.tempUnit,
  });

  const [v2local, setV2Local] = React.useState(v2prefs);
  const setV2Path = React.useCallback((path, value) => {
    setV2Local(prev => {
      const parts = path.split('.');
      if (parts.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) return prev;
      const next = { ...prev };
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);
  const v2get = (path) => path.split('.').reduce((o, k) => o?.[k], v2local);

  const handleSave = () => {
    onSave(pendingPrefs);
    onSaveV2(v2local);
    onClose();
  };

  const inp = {
    fontFamily: T.mono, fontSize: u(13), color: T.ink, background: T.paper2,
    border: '1px solid ' + T.rule2, padding: u(8) + ' ' + u(10), outline: 'none',
    boxSizing: 'border-box', display: 'block', width: '100%',
  };
  const btnPrimary = {
    fontFamily: T.sans, fontSize: u(10), fontWeight: 700, letterSpacing: u(1.8),
    textTransform: 'uppercase', padding: u(9) + ' ' + u(22), cursor: 'pointer',
    border: 'none', background: T.ink, color: T.paper,
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 10 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 'min(' + u(480) + ', 100%)', background: T.paper,
        borderLeft: '1px solid ' + T.rule, display: 'flex', flexDirection: 'column',
        overflowY: 'auto', boxShadow: u(-8) + ' 0 ' + u(32) + ' rgba(0,0,0,0.14)',
      }}>
        {/* Header */}
        <div style={{ padding: u(22) + ' ' + u(28) + ' 0', flexShrink: 0 }}>
          <div style={{ borderTop: u(3) + ' solid ' + T.rule, borderBottom: '1px solid ' + T.rule, height: u(6), marginBottom: u(14) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(3), textTransform: 'uppercase', color: T.ink3, marginBottom: u(4) }}>
                Configuration
              </div>
              <div style={{ fontFamily: T.serif, fontSize: u(26), fontWeight: 800, letterSpacing: u(-0.8), color: T.ink, lineHeight: 1 }}>
                Settings
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.mono, fontSize: u(16), color: T.ink3, padding: u(4) }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: u(18) + ' ' + u(28) + ' ' + u(28), display: 'flex', flexDirection: 'column' }}>
          <Kicker>Miners</Kicker>
          <MinersSection miners={miners} onRefresh={onRefresh} inp={inp} />

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <Kicker>Preferences</Kicker>
          <div style={{ height: u(10) }} />
          <PreferencesSection prefs={prefs} inp={inp} onChange={setPendingPrefs} />

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <Kicker>Alerts</Kicker>
          <AlertsSection v2get={v2get} setV2Path={setV2Path} />

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <FeedsThemeSection v2get={v2get} setV2Path={setV2Path} v2local={v2local} />

          <div style={{ borderTop: '1px solid ' + T.rule2, margin: u(20) + ' 0 ' + u(16) }} />
          <IntervalsDataSection v2get={v2get} setV2Path={setV2Path} v2local={v2local} />

          <div style={{ display: 'flex', alignItems: 'center', gap: u(10), marginTop: u(24), borderTop: '1px solid ' + T.rule2, paddingTop: u(18) }}>
            <button style={btnPrimary} onClick={handleSave}>Save</button>
            <button style={{ ...btnPrimary, background: 'transparent', color: T.ink3 }} onClick={onClose}>Cancel</button>
            <span style={{ marginLeft: 'auto', fontSize: u(10), color: T.ink4, fontFamily: T.mono }}>{`v${__VERSION__}`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
