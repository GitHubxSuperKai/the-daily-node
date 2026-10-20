import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import { fmtHHMM } from '../utils/formatting.js';
import { useFitRows } from '../utils/fitRows.js';
import Kicker from './Kicker';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_MS = 60 * 60 * 1000;

const LABELS = { fee: 'Fee spike', blockTime: 'Block time', minerOffline: 'Miner offline', price: 'Price move' };

// What the enabled alerts watch, as one sentence for the "nothing fired" state.
export function watchingSentence(alertPrefs) {
  const a = alertPrefs || {};
  const parts = [];
  if (a.fee?.enabled) parts.push(`fees above ${a.fee.threshold} sat/vB`);
  if (a.blockTime?.enabled) parts.push('blocks over 15 min');
  if (a.minerOffline?.enabled) parts.push('miners going offline');
  if (a.price?.enabled) parts.push(`price moves of ${a.price.pctThreshold}% in ${a.price.windowMin} min`);
  if (parts.length === 0) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `All quiet. Watching ${list}.`;
}

// The toast text repeats the alert type ("Fee spike: 64 sat/vB ..."); the row already has
// it as a label, so drop the prefix there.
export function shortMessage(message) {
  return String(message).replace(/^(Fee spike|Miner offline):\s*/, '');
}

function fmtAlertTime(ts, timeFormat) {
  const d = new Date(ts);
  return fmtHHMM(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, timeFormat);
}

// The desktop sidebar's list of alerts fired in the last 24 hours, newest first. Fills the
// space the rail has left and shows as many rows as fit. Each row has a dismiss × that
// shows on hover (or keyboard focus).
export function AlertsPanel({ alerts, alertPrefs, onDismiss, now, timeFormat }) {
  const T = useT();
  const ref = React.useRef(null);
  const [active, setActive] = React.useState(null);

  const anyEnabled = Object.values(alertPrefs || {}).some(a => a?.enabled);
  const recent = anyEnabled
    ? (alerts || []).filter(a => now - a.ts < DAY_MS).sort((a, b) => b.ts - a.ts)
    : [];
  const fit = useFitRows(ref, recent.length);
  const newCount = recent.filter(a => now - a.ts < NEW_MS).length;

  const countLabel = !anyEnabled ? 'Off'
    : recent.length === 0 ? 'None in 24h'
      : `${recent.length} in 24h${newCount > 0 ? ` · ${newCount} new` : ''}`;

  const note = !anyEnabled
    ? 'All alerts are off. Turn them on in Settings › Alerts.'
    : recent.length === 0 ? watchingSentence(alertPrefs) : null;

  const colorOf = type => (type === 'minerOffline' ? T.red : type === 'blockTime' ? T.ink3 : T.orange);

  return (
    <div ref={ref} data-alerts style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Kicker>Alerts</Kicker>
        <span style={{ fontFamily: T.body, fontSize: u(10), color: T.ink3 }}>{countLabel}</span>
      </div>
      {note && (
        <div style={{ marginTop: u(8), fontFamily: T.body, fontStyle: 'italic', fontSize: u(12), lineHeight: 1.45, color: T.ink3 }}>
          {note}
        </div>
      )}
      {recent.length > 0 && (
        <div style={{ marginTop: u(8) }}>
          {recent.map((a, i) => {
            // The first row stays laid out (hidden) when none fit, so useFitRows can measure it.
            if (i >= Math.max(fit, 1)) return null;
            const isNew = now - a.ts < NEW_MS;
            const c = colorOf(a.type);
            const showX = active === a.id;
            return (
              <div
                key={a.id}
                data-fit-row
                onMouseEnter={() => setActive(a.id)}
                onMouseLeave={() => setActive(prev => (prev === a.id ? null : prev))}
                onFocus={() => setActive(a.id)}
                onBlur={() => setActive(prev => (prev === a.id ? null : prev))}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `${u(8)} 1fr auto ${u(14)}`,
                  columnGap: u(8),
                  rowGap: u(2),
                  padding: `${u(6)} 0`,
                  // Every row has the 1px rule (transparent on the first) so all share one height.
                  borderTop: `1px solid ${i > 0 ? T.rule2 : 'transparent'}`,
                  visibility: fit === 0 ? 'hidden' : 'visible',
                }}
              >
                <span style={{
                  width: u(7), height: u(7), marginTop: u(4), borderRadius: '50%', boxSizing: 'border-box',
                  background: isNew ? c : 'transparent', border: `1px solid ${c}`,
                }} />
                <span style={{
                  fontFamily: T.sans, fontSize: u(10), letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: isNew ? T.ink : T.ink2,
                }}>
                  {LABELS[a.type] || a.type}
                </span>
                <span style={{ fontFamily: T.body, fontSize: u(10), color: T.ink3, textAlign: 'right' }}>
                  {fmtAlertTime(a.ts, timeFormat)}
                </span>
                <button
                  type="button"
                  aria-label={`Dismiss ${LABELS[a.type] || a.type} alert`}
                  onClick={() => onDismiss?.(a.id)}
                  style={{
                    gridRow: 1, gridColumn: 4, alignSelf: 'start', height: u(12), padding: 0,
                    border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: T.sans, fontSize: u(14), lineHeight: u(12), color: T.ink,
                    opacity: showX ? 1 : 0,
                  }}
                >
                  ×
                </button>
                <span />
                <span style={{
                  gridColumn: '2 / 5', fontFamily: T.body, fontSize: u(12),
                  color: isNew ? T.ink2 : T.ink3,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {shortMessage(a.message)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AlertsPanel;
