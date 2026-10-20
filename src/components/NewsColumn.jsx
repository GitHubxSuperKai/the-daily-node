import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Kicker from './Kicker';
import { ScrollHint } from './ScrollHint';
import { isFresh } from '../utils/formatting.js';

// Topics from classifyTopic, plus PODCASTS (set by useRSS). The section headers are
// the categorisation; each item's label is its outlet.
const NEWS_SECTIONS = ['MARKETS', 'MINING', 'REGULATION', 'TECH', 'GLOBAL', 'BITCOIN', 'PODCASTS'];

export function NewsColumn({ newsItems, rssErr, loaded, hasLead }) {
  const T = useT();
  const grouped = NEWS_SECTIONS.reduce((acc, topic) => {
    const group = newsItems.filter(it => it.topic === topic);
    if (group.length > 0) acc.push({ topic, group });
    return acc;
  }, []);

  return (
    <div style={{ borderRight: `1px solid ${T.rule2}`, paddingRight: u(24), overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Kicker>Bitcoin news</Kicker>
        {rssErr && <Kicker color={T.red}>feed error</Kicker>}
      </div>
      <ScrollHint style={{ marginTop: u(8), flex: 1 }}>
        {newsItems.length > 0 ? grouped.map(({ topic, group }) => (
          <React.Fragment key={topic}>
            <div style={{ display: 'flex', alignItems: 'center', gap: u(10), padding: `${u(10)} 0 ${u(6)}` }}>
              <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
              <span style={{ fontFamily: T.sans, fontSize: u(10), fontWeight: 600, letterSpacing: u(2.5), textTransform: 'uppercase', color: T.ink3 }}>{topic}</span>
              <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
            </div>
            {group.map((it, i) => (
              <a
                key={it.link || i}
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: `${u(8)} 0`,
                  borderBottom: `1px solid ${T.rule3}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: u(4) }}>
                  <Kicker color={T.ink3}>{it.src}</Kicker>
                  <span style={{ fontFamily: T.num, fontSize: u(10), color: isFresh(it.t) ? T.orange : T.ink3 }}>{it.t}</span>
                </div>
                <div style={{ fontFamily: T.body, fontSize: u(14.5), lineHeight: 1.3, color: T.ink, letterSpacing: u(-0.1) }}>
                  {it.hed}
                </div>
              </a>
            ))}
          </React.Fragment>
        )) : (
          <div style={{ fontFamily: T.num, fontSize: u(12), color: T.ink3, marginTop: u(16) }}>
            {rssErr ? 'All feeds unavailable' : loaded ? (hasLead ? 'No more headlines right now' : 'No Bitcoin headlines right now') : 'Loading headlines…'}
          </div>
        )}
      </ScrollHint>
    </div>
  );
}

export default NewsColumn;
