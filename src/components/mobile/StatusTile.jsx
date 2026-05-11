import React from 'react';
import { useT } from '../../theme.js';

function StatusTile({ label, onClick, ariaLabel, fullWidth, children }) {
  const T = useT();
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        gridColumn: fullWidth ? '1 / -1' : 'auto',
        background: T.paper,
        border: `1px solid ${T.rule2}`,
        padding: '12px 14px',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: onClick ? 'pointer' : 'default',
        minHeight: 64,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 6,
      }}
    >
      {label && (
        <div style={{
          fontFamily: T.sans,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: T.ink3,
        }}>
          {label}
        </div>
      )}
      <div>{children}</div>
    </Tag>
  );
}

StatusTile = React.memo(StatusTile);

export { StatusTile };
