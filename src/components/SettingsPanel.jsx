import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';
import { ScrollHint } from './ScrollHint';
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
      const next = { ...prev };
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return prev;
        obj[key] = { ...obj[key] };
        obj = obj[key];
      }
      const last = parts[parts.length - 1];
      if (last === '__proto__' || last === 'constructor' || last === 'prototype') return prev;
      obj[last] = value;
      return next;
    });
  }, []);
  const v2get = (path) => path.split('.').reduce((o, k) => o?.[k], v2local);

  // Modal focus: move focus in on open, keep Tab inside (on mobile the covered
  // tab bar stays in the tab order otherwise), and hand it back on close.
  // Escape and the focusin guard listen on the document: a focused button that
  // disables (MinersSection's Add/Remove while busy) drops focus to body, where
  // the dialog's own keydown never fires. The guard only acts if focus then
  // lands outside, so Chrome's Tab, which resumes beside the disabled button,
  // is left alone.
  const dialogRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus();
    // Skip an Escape that cancels an IME composition (browsers flag it with
    // isComposing, keyCode 229, or both)
    // or that a control inside already handled.
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
      onCloseRef.current();
    };
    const onFocusIn = (e) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target)) dialogRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const trapTab = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.disabled && el.type !== 'hidden');
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  };

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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={trapTab}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 'min(' + u(480) + ', 100%)', background: T.paper,
          borderLeft: '1px solid ' + T.rule, display: 'flex', flexDirection: 'column',
          boxShadow: u(-8) + ' 0 ' + u(32) + ' rgba(0,0,0,0.14)',
          outline: 'none',
        }}>
        {/* The panel keeps its background; only the inner scroller is masked. */}
        <ScrollHint style={{ flex: 1 }}>
          {/* Header */}
          <div style={{ padding: u(22) + ' ' + u(28) + ' 0', flexShrink: 0 }}>
            <div style={{ borderTop: u(3) + ' solid ' + T.rule, borderBottom: '1px solid ' + T.rule, height: u(6), marginBottom: u(14) }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(3), textTransform: 'uppercase', color: T.ink3, marginBottom: u(4) }}>
                  Configuration
                </div>
                <div id="settings-title" style={{ fontFamily: T.serif, fontSize: u(26), fontWeight: 800, letterSpacing: u(-0.8), color: T.ink, lineHeight: 1 }}>
                  Settings
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close settings"
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
        </ScrollHint>
      </div>
    </div>
  );
}
