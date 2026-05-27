import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Rule from './Rule';
import Kicker from './Kicker';
import Num from './Num';
import LineChart from './LineChart';
import { ProofOfRead } from './ProofOfRead';
import { LeadImage } from './LeadImage';
import {
  fmtPrice,
  fmtPct,
  fmtNum,
  fmtVolUsd,
  fmtHashrate,
  fmtMempoolMB,
} from '../utils/formatting.js';

const isFresh = t => t === 'just now' || /^\d+s ago$/.test(t) || /^[1-4]m ago$/.test(t);

export function MarketsColumn({ btc, chain, rss, priceHistoryData }) {
  const T = useT();

  const btcPrice   = btc.data ? `$${fmtPrice(btc.data.price)}` : '—';
  const btcChgPct  = btc.data ? fmtPct(btc.data.chgPct) : '—';
  const btcUp      = btc.data ? btc.data.chgPct >= 0 : true;
  const btcHi      = btc.data ? fmtPrice(btc.data.hi) : '—';
  const btcLo      = btc.data ? fmtPrice(btc.data.lo) : '—';
  const btcCap     = btc.data?.cap != null ? `$${(btc.data.cap / 1e12).toFixed(2)}T` : '—';
  const btcVol     = btc.data ? fmtVolUsd(btc.data.volBtc * btc.data.price) : '—';
  const athPct     = btc.data?.ath ? ((btc.data.price - btc.data.ath) / btc.data.ath) * 100 : null;
  const athAtNew   = athPct != null && athPct >= 0;

  const hashrate   = chain.data ? fmtHashrate(chain.data.hashrate) : '—';
  const mempoolTx  = chain.data ? fmtNum(chain.data.mempoolTx) : '—';
  const mempoolMB  = chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—';
  const feeFast    = chain.data ? `${chain.data.feeFast} sat/vB` : '—';
  const feeEco     = chain.data ? `${chain.data.feeEco} sat/vB` : '—';

  const lead       = rss.leadStory;

  return (
    <div
      style={{
        borderRight: `1px solid ${T.rule2}`,
        paddingRight: u(24),
        display: 'flex',
        flexDirection: 'column',
        gap: u(13),
        overflow: 'hidden',
      }}
    >
      <ProofOfRead
        btc={btc}
        chain={chain}
        hashrate={hashrate}
        mempoolTx={mempoolTx}
        mempoolMB={mempoolMB}
        feeFast={feeFast}
        feeEco={feeEco}
        btcPrice={btcPrice}
        btcLo={btcLo}
        btcHi={btcHi}
      />
      <Kicker>Markets · BTC / USD</Kicker>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Num size="hero" value={btcPrice} />
        <div style={{ fontFamily: T.num, fontSize: u(22), fontWeight: 400, color: btcUp ? T.green : T.red, paddingBottom: u(10), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
          {btcUp ? '▲' : '▼'} {btcChgPct}%
        </div>
      </div>
      {btc.data?.ath && (
        <div style={{ fontFamily: T.num, fontSize: u(10), color: T.ink4, marginTop: u(-8), marginBottom: u(2) }}>
          {'ATH $' + Math.round(btc.data.ath).toLocaleString() + (btc.data.athDate ? ' · ' + new Date(btc.data.athDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '') + ' · '}
          <span style={{ color: athAtNew ? T.green : T.red }}>{athAtNew ? '▲ new ATH' : ('▼ ' + Math.abs(athPct).toFixed(1) + '%')}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(11), borderTop: `1px solid ${T.rule2}`, borderBottom: `1px solid ${T.rule2}`, padding: `${u(5)} 0`, marginBottom: u(6), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
        <span style={{ color: T.green }}>hi ${btcHi}</span>
        <span style={{ color: T.ink3 }}>·</span>
        <span style={{ color: T.red }}>lo ${btcLo}</span>
        <span style={{ color: T.ink3 }}>·</span>
        <span style={{ color: btcUp ? T.green : T.red }}>cap {btcCap}</span>
        <span style={{ color: T.ink3 }}>·</span>
        <span style={{ color: T.ink3 }}>vol {btcVol}</span>
        <span style={{ color: T.ink3 }}>·</span>
        <span style={{ color: T.orange }}>
          {btc.data ? fmtNum(Math.round(1e8 / btc.data.price)) : '—'} sat/$
        </span>
      </div>
      {/* LineChart: parent div provides CSS dimensions, chart fills it */}
      <div style={{ width: '100%', height: u(110), flexShrink: 0 }}>
        <LineChart color={T.orange} points={btc.chartPts} vwap={btc.data?.vwap} fill historyPoints={priceHistoryData} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(10), color: T.ink3 }}>
        <span>24h ago</span><span>−18h</span><span>−12h</span><span>−6h</span><span>now</span>
      </div>
      <Rule dash />
      {/* Lead story */}
      {lead ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u(8), overflow: 'hidden', minHeight: 0, borderLeft: lead.topic === 'BREAKING' ? `${u(3)} solid ${T.red}` : 'none', paddingLeft: lead.topic === 'BREAKING' ? u(10) : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Kicker color={lead.topic === 'BREAKING' ? T.red : T.orange}>
              {lead.topic === 'BREAKING' ? 'BREAKING' : `● ${lead.cat}`} · {lead.src}
            </Kicker>
            <Kicker color={isFresh(lead.t) ? T.orange : undefined}>{lead.t}</Kicker>
          </div>
          <a href={lead.link} target="_blank" rel="noopener noreferrer">
            <h1 style={{ fontFamily: T.serif, fontSize: u(32), fontWeight: 700, lineHeight: 1.04, letterSpacing: u(-1), color: T.ink, textWrap: 'balance', margin: 0 }}>
              {lead.hed}
            </h1>
          </a>
          {lead.img ? <LeadImage src={lead.img} domain={lead.src} /> : null}
          {lead.snippet ? (
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', minHeight: 0, fontFamily: T.body, fontSize: u(13.5), lineHeight: 1.5, color: T.ink2 }}>
              <span style={{ fontFamily: T.serif, fontSize: u(44), fontWeight: 700, color: T.ink, float: 'left', lineHeight: 0.88, marginRight: u(8), marginTop: u(3) }}>
                {lead.snippet.charAt(0)}
              </span>
              {lead.snippet.slice(1)}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <Kicker color={T.orange}>● {rss.err ? 'RSS unavailable' : 'Loading feed…'}</Kicker>
          <h1 style={{ fontFamily: T.serif, fontSize: u(32), fontWeight: 700, lineHeight: 1.04, letterSpacing: u(-1), color: T.ink4, margin: 0 }}>
            {rss.err ? 'All feeds unavailable' : 'Fetching headlines…'}
          </h1>
        </>
      )}
    </div>
  );
}

export default MarketsColumn;
