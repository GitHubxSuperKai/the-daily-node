import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';

const SPLIT = 5;

function News({ lead, rss }) {
  const T = useT();
  const newsItems = rss.items || [];

  return (
    <div style={{ borderRight:`1px solid ${T.rule2}`, paddingRight:24, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <Kicker>Bitcoin news</Kicker>
        {rss.err && <Kicker color={T.red}>feed error</Kicker>}
      </div>
      <div className={`news-col-wrap${newsItems.length < 8 ? ' at-bottom' : ''}`} style={{ marginTop:8, flex:1, minHeight:0 }}>
        <div className="news-scroll" style={{ height:'100%', overflowY:'auto' }}
          onScroll={e => {
            const el = e.currentTarget;
            const wrap = el.parentElement;
            el.classList.add('is-scrolling');
            clearTimeout(wrap._st);
            wrap._st = setTimeout(() => el.classList.remove('is-scrolling'), 1200);
            wrap.classList.toggle('at-bottom', el.scrollHeight - el.scrollTop - el.clientHeight < 4);
          }}>
          {newsItems.length > 0 ? (() => {
            return newsItems.map((it, i) => (
              <React.Fragment key={i}>
                {i === SPLIT && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                    <div style={{ flex:1, borderTop:`1px solid ${T.rule2}` }} />
                    <span style={{ fontFamily:T.sans, fontSize:9, fontWeight:600, letterSpacing:2.5, textTransform:'uppercase', color:T.ink4 }}>More Stories</span>
                    <div style={{ flex:1, borderTop:`1px solid ${T.rule2}` }} />
                  </div>
                )}
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: i === 0 ? '0 0 12px' : '8px 0',
                    borderBottom: `1px solid ${T.rule3}`,
                    borderLeft: it.cat === 'BREAKING' ? `3px solid ${T.red}` : 'none',
                    paddingLeft: it.cat === 'BREAKING' ? 10 : 0,
                  }}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom: i === 0 ? 6 : 4 }}>
                    <Kicker color={it.cat === 'BREAKING' ? T.red : T.ink3}>{it.cat}</Kicker>
                    <span style={{ fontFamily:T.mono, fontSize:10, color:T.ink3 }}>{it.t}</span>
                  </div>
                  <div style={{
                    fontFamily: i === 0 ? T.serif : T.body,
                    fontSize: i === 0 ? 22 : 14,
                    fontWeight: i === 0 ? 700 : 400,
                    lineHeight: i === 0 ? 1.15 : 1.3,
                    letterSpacing: i === 0 ? -0.5 : -0.1,
                    color: T.ink,
                  }}>
                    {it.hed}
                  </div>
                  <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:11, color:T.ink3, marginTop:2 }}>{it.src}</div>
                </a>
              </React.Fragment>
            ));
          })() : (
            <div style={{ fontFamily:T.mono, fontSize:12, color:T.ink3, marginTop:16 }}>
              {rss.err ? 'All feeds unavailable' : 'Loading headlines…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default News;
