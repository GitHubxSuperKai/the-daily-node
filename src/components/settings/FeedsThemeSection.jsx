import React from 'react';
import { useT } from '../../theme';
import { TweaksSection, TweaksCheckRow } from './helpers';

export function FeedsThemeSection({ v2get, setV2Path, v2local }) {
  const T = useT();
  return (
    <>
      <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>RSS FEEDS</span>
      <TweaksSection T={T}>
        {[
          { key: 'feeds.bitcoinMagazine', label: 'Bitcoin Magazine' },
          { key: 'feeds.coindesk',        label: 'CoinDesk' },
          { key: 'feeds.newsBitcoin',     label: 'News.Bitcoin.com' },
        ].map(({ key, label }) => <TweaksCheckRow key={key} path={key} label={label} get={v2get} setPath={setV2Path} />)}
      </TweaksSection>

      <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>THEME</span>
      <TweaksSection T={T}>
        {[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (by sunset)']].map(([val, label]) => (
          <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
            <input
              type="radio"
              name="tweak-theme"
              value={val}
              checked={v2local.theme === val}
              onChange={() => setV2Path('theme', val)}
              style={{ width: 14, height: 14 }}
            />
            <span style={{ fontSize: 13 }}>{label}</span>
          </label>
        ))}
      </TweaksSection>
    </>
  );
}
