import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Kicker from './Kicker';

const NEWS_SECTIONS = ['BREAKING', 'MARKETS', 'MINING', 'REGULATION', 'TECH', 'GLOBAL', 'BITCOIN'];
const isFresh = t => t === 'just now' || /^\d+s ago$/.test(t) || /^[1-4]m ago$/.test(t);

export function NewsColumn({ newsItems, rssErr }) {
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
      <div className={`news-col-wrap${newsItems.length < 8 ? ' at-bottom' : ''}`} style={{ marginTop: u(8), flex: 1, minHeight: 0 }}>
        <div
          className="news-scroll"
          style={{ height: '100%', overflowY: 'auto' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const wrap = el.parentElement;
            el.classList.add('is-scrolling');
            clearTimeout(wrap._st);
            wrap._st = setTimeout(() => el.classList.remove('is-scrolling'), 1200);
            wrap.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 4);
          }}
        >
          {newsItems.length > 0 ? grouped.map(({ topic, group }) => (
            <React.Fragment key={topic}>
              <div style={{ display: 'flex', alignItems: 'center', gap: u(10), padding: `${u(10)} 0 ${u(6)}` }}>
                <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
                <span style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(2.5), textTransform: 'uppercase', color: T.ink4 }}>{topic}</span>
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
                    borderLeft: it.topic === 'BREAKING' ? `${u(3)} solid ${T.red}` : 'none',
                    paddingLeft: it.topic === 'BREAKING' ? u(10) : 0,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: u(4) }}>
                    <Kicker color={it.topic === 'BREAKING' ? T.red : T.ink3}>{it.cat}</Kicker>
                    <span style={{ fontFamily: T.num, fontSize: u(10), color: isFresh(it.t) ? T.orange : T.ink3 }}>{it.t}</span>
                  </div>
                  <div style={{ fontFamily: T.body, fontSize: u(14.5), lineHeight: 1.3, color: T.ink, letterSpacing: u(-0.1) }}>
                    {it.hed}
                  </div>
                  <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink3, marginTop: u(2) }}>
                    {it.src}
                  </div>
                </a>
              ))}
            </React.Fragment>
          )) : (
            <div style={{ fontFamily: T.num, fontSize: u(12), color: T.ink3, marginTop: u(16) }}>
              {rssErr ? 'All feeds unavailable' : 'Loading headlines…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewsColumn;
