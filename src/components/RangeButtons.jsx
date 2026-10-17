import React, { useCallback } from 'react';
import { useT } from '../theme';
import { RANGES, RANGE_KEYS } from '../utils/chartRange.js';

// Shared by the desktop MarketsColumn (calc() strings) and the mobile
// BitcoinPanel (plain px numbers). Must stay free of the desktop-only u() helper.
function RangeButtons({ value, onChange, note, fontSize, padX, minHeight, gap }) {
  const T = useT();
  const handle = useCallback((key) => {
    if (key !== value) onChange(key);
  }, [value, onChange]);

  return (
    <div role="group" aria-label="Chart range" style={{ display: 'flex', alignItems: 'center', gap }}>
      {RANGE_KEYS.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            data-range={key}
            aria-pressed={active}
            onClick={() => handle(key)}
            style={{
              border: 'none',
              background: 'none',
              padding: `0 ${typeof padX === 'number' ? `${padX}px` : padX || 0}`,
              minHeight,
              cursor: 'pointer',
              fontFamily: T.mono,
              fontSize,
              fontWeight: active ? 700 : 400,
              color: active ? T.orange : T.ink3,
            }}
          >
            {RANGES[key].label}
          </button>
        );
      })}
      {note ? <span data-testid="range-note" style={{ fontFamily: T.mono, fontSize, color: T.ink3 }}>{note}</span> : null}
    </div>
  );
}

export default React.memo(RangeButtons);
