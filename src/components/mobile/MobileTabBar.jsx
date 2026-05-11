import React from 'react';
import { useT } from '../../theme.js';

const TABS = [
  { id: 'home',    label: 'Home',    glyph: '◉' },
  { id: 'bitcoin', label: 'Bitcoin', glyph: '₿' },
  { id: 'news',    label: 'News',    glyph: '▤' },
];

function MobileTabBar({ activeTab, onChange }) {
  const T = useT();
  return (
    <nav
      role="tablist"
      style={{
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        display: 'flex',
        background: T.paper,
        borderTop: `1px solid ${T.rule2}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}
    >
      {TABS.map(tab => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              height: 56,
              background: 'none',
              border: 'none',
              borderTop: `2px solid ${active ? T.orange : 'transparent'}`,
              color: active ? T.ink : T.ink3,
              fontFamily: T.sans,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.glyph}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

MobileTabBar = React.memo(MobileTabBar);

export { MobileTabBar };
