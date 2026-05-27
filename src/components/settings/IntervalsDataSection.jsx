import React from 'react';
import { useT } from '../../theme';
import { TweaksSection, TweaksRow, TweaksNumInput, TweaksCheckRow } from './helpers';

export function IntervalsDataSection({ v2get, setV2Path, v2local }) {
  const T = useT();
  return (
    <>
      <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>REFRESH INTERVALS</span>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>Values in seconds. Reload page to apply.</div>
      <TweaksSection T={T}>
        {[
          { key: 'intervals.price',   label: 'BTC price',    min: 15,  max: 300  },
          { key: 'intervals.chain',   label: 'Chain vitals', min: 30,  max: 600  },
          { key: 'intervals.weather', label: 'Weather',      min: 300, max: 3600 },
          { key: 'intervals.rss',     label: 'News',         min: 60,  max: 1800 },
          { key: 'intervals.bitaxe',  label: 'Miners',       min: 10,  max: 300  },
        ].map(({ key, label, min, max }) => (
          <TweaksRow key={key} label={label} T={T}><TweaksNumInput path={key} min={min} max={max} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
        ))}
      </TweaksSection>

      <span style={{ fontFamily: T.display || T.sans, fontSize: 11, letterSpacing: '0.08em', color: T.ink3, marginBottom: 4, display: 'block', marginTop: 8 }}>DATA SOURCES</span>
      <TweaksSection T={T}>
        <TweaksRow label="Mempool endpoint" T={T}>
          <input
            type="text"
            value={v2local.mempool?.baseUrl ?? ''}
            onChange={e => setV2Path('mempool.baseUrl', e.target.value.trim())}
            placeholder="https://mempool.space (default)"
            spellCheck={false}
            style={{
              width: 220, background: T.paper, color: T.ink, fontSize: 13,
              border: '1px solid ' + T.ink3, borderRadius: 3, padding: '2px 5px',
            }}
          />
        </TweaksRow>
        {!!(v2local.mempool?.baseUrl) && (
          <TweaksCheckRow
            path="mempool.fallbackToPublic"
            label="Fall back to public mempool.space if self-hosted fails"
            get={v2get}
            setPath={setV2Path}
          />
        )}
      </TweaksSection>
    </>
  );
}
