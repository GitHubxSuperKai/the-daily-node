import React from 'react';
import { useT } from '../../theme.js';

const isFreshTs = t => t === 'just now' || /^\d+s ago$/.test(t) || /^[1-4]m ago$/.test(t);

function NewsPanel({ rss }) {
  const T = useT();
  const items = (rss && rss.items) || [];
  const lead = items[0];
  const rest = items.slice(1, 25);

  return (
    <div style={{ padding: '14px 16px 80px', background: T.paper, color: T.ink }}>

      {/* Lead story */}
      {lead && (
        <section style={{
          paddingBottom: 16,
          borderBottom: `1px solid ${T.rule2}`,
          borderLeft: lead.topic === 'BREAKING' ? `3px solid ${T.red}` : 'none',
          paddingLeft: lead.topic === 'BREAKING' ? 10 : 0,
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2,
            textTransform: 'uppercase',
            color: lead.topic === 'BREAKING' ? T.red : T.orange,
            marginBottom: 8,
          }}>
            {lead.topic === 'BREAKING' ? 'BREAKING' : `● ${lead.cat || 'TOP'}`} · {lead.src}
          </div>
          <a href={lead.link} target="_blank" rel="noopener noreferrer">
            <h2 style={{
              fontFamily: T.serif, fontSize: 26, fontWeight: 700,
              lineHeight: 1.1, letterSpacing: -0.5, color: T.ink, margin: 0,
            }}>
              {lead.hed}
            </h2>
          </a>
        </section>
      )}

      {/* Headlines */}
      <section style={{ paddingTop: 14 }}>
        <div style={{
          fontFamily: T.sans, fontSize: 9, fontWeight: 600,
          letterSpacing: 2, textTransform: 'uppercase', color: T.ink3,
          marginBottom: 8,
        }}>
          Bitcoin News
        </div>
        {items.length === 0 ? (
          <div style={{ fontFamily: T.num, fontSize: 12, color: T.ink3 }}>
            {rss && rss.err ? 'Feed unavailable' : 'Loading…'}
          </div>
        ) : rest.map((it, i) => (
          <a
            key={it.link || i}
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              padding: '10px 0',
              borderBottom: `1px solid ${T.rule3}`,
              borderLeft: it.topic === 'BREAKING' ? `3px solid ${T.red}` : 'none',
              paddingLeft: it.topic === 'BREAKING' ? 10 : 0,
            }}
          >
            <div style={{ fontFamily: T.body, fontSize: 15, lineHeight: 1.3, color: T.ink, letterSpacing: -0.1 }}>
              {it.hed}
            </div>
            <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: 11, color: T.ink3, marginTop: 3 }}>
              {it.src} · <span style={{ color: isFreshTs(it.t) ? T.orange : T.ink3 }}>{it.t}</span>
            </div>
          </a>
        ))}
      </section>
    </div>
  );
}

NewsPanel = React.memo(NewsPanel);

export { NewsPanel };
