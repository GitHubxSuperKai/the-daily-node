import React from 'react';
import { useT } from '../../theme.js';

const isFreshTs = t => t === 'just now' || /^\d+s ago$/.test(t) || /^[1-4]m ago$/.test(t);

function NewsPanel({ rss }) {
  const T = useT();
  const lead = rss?.leadStory ?? null;
  const rest = (rss && rss.items) || [];

  return (
    <div style={{ padding: '14px 16px 80px', background: T.paper, color: T.ink }}>

      {/* Lead story */}
      {lead && (
        <section style={{
          paddingBottom: 16,
          borderBottom: `1px solid ${T.rule2}`,
        }}>
          <div style={{
            fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 2,
            textTransform: 'uppercase',
            color: T.orange,
            marginBottom: 8,
          }}>
            ● {lead.topic || 'TOP'} · {lead.src}
          </div>
          {lead.img && (
            <img
              src={lead.img}
              alt=""
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                borderRadius: 6,
                display: 'block',
                marginBottom: 10,
              }}
              // Skip to the next qualifying story rather than show a lead without its image.
              onError={() => rss.skipLead && rss.skipLead(lead.img)}
            />
          )}
          <a href={lead.link} target="_blank" rel="noopener noreferrer" style={{ WebkitTapHighlightColor: T.rule3, color: 'inherit' }}>
            <h2 style={{
              fontFamily: T.serif, fontSize: 26, fontWeight: 700,
              lineHeight: 1.1, letterSpacing: -0.5, color: T.ink, margin: 0,
            }}>
              {lead.hed}
            </h2>
          </a>
          {lead.snippet && (
            <p style={{
              fontFamily: T.body,
              fontSize: 14,
              lineHeight: 1.5,
              color: T.ink2,
              marginTop: 8,
              marginBottom: 0,
            }}>
              {lead.snippet.length > 160
                ? lead.snippet.slice(0, 160) + '…'
                : lead.snippet}
            </p>
          )}
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
        {rest.length === 0 ? (
          <div style={{ fontFamily: T.num, fontSize: 12, color: T.ink3 }}>
            {rss && rss.err ? 'Feed unavailable' : rss && rss.lastOk ? 'No Bitcoin headlines right now' : 'Loading…'}
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
              WebkitTapHighlightColor: T.rule3,
              color: 'inherit',
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
