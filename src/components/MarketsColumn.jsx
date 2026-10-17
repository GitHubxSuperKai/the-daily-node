import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';
import Rule from './Rule';
import Kicker from './Kicker';
import Num from './Num';
import LineChart from './LineChart';
import RangeButtons from './RangeButtons';
import { mergeSeries, pctSince, latestHistoryMs } from '../utils/chartSeries.js';
import { RANGES, windowSeries, axisLabels, chipTime } from '../utils/chartRange.js';
import { ProofOfRead } from './ProofOfRead';
import { LeadImage } from './LeadImage';
import {
  fmtPrice,
  fmtPct,
  fmtNum,
  fmtVolUsd,
  fmtHashrate,
  fmtMempoolMB,
  isFresh,
} from '../utils/formatting.js';

// Fallback for callers that pass no chart (older tests); never mutated.
const EMPTY_CHART = Object.freeze({ points: null, domain: null, stale: false, aged: false, failed: false });
const NOOP = () => {};

export function MarketsColumn({ btc, chain, rss, priceHistoryData, chart: chartProp, range = '24h', onRangeChange }) {
  const T = useT();
  const chart = chartProp ?? EMPTY_CHART;

  const [hover, setHover] = React.useState(null);

  // App re-renders every second and this component is not memo'd, so the `points`
  // handed to LineChart (`series` below) must keep its identity between data changes:
  // LineChart clears the hover whenever its merged series changes. `domain` is keyed on
  // its values there and `onHover` goes through a ref, but `series` depends on `domain`,
  // so Date.now() lives only in the memo.
  // With no chart domain (Kraken not loaded) the window ends at the newest history row, so a
  // history-only 1H/24H chart keeps advancing; it changes only when history does.
  const useHistory = range === '1h' || range === '24h';
  const historyEnd = React.useMemo(
    () => (useHistory ? latestHistoryMs(priceHistoryData) : null),
    [useHistory, priceHistoryData],
  );
  const domain = React.useMemo(() => {
    if (chart.domain) return chart.domain;
    const end = historyEnd ?? Date.now();
    return [end - RANGES[range].spanMs, end];
  }, [chart.domain, range, historyEnd]);
  const series = React.useMemo(
    () => windowSeries(mergeSeries(useHistory ? priceHistoryData : null, chart.points), domain),
    [priceHistoryData, chart.points, domain, useHistory],
  );
  const chipFormat = React.useCallback((t) => chipTime(range, t), [range]);

  const btcPrice   = btc.data ? `$${fmtPrice(btc.data.price)}` : '—';
  const headPrice  = hover ? hover.price : btc.data?.price;
  const headText   = Number.isFinite(headPrice) ? `$${fmtPrice(headPrice)}` : '—';
  let slotPct;
  if (hover) slotPct = pctSince(hover.price, btc.data?.price);
  else if (range === '24h') slotPct = btc.data?.chgPct;
  else if (chart.stale) slotPct = null;
  else slotPct = pctSince(series[0]?.[1], btc.data?.price);
  const slotKnown  = Number.isFinite(slotPct);
  const rangeSuffix = !hover && range !== '24h' && slotKnown ? RANGES[range].label.toLowerCase() : null;
  const rangeNote  = chart.failed && (chart.stale || !chart.points) ? 'no data' : null;
  const slotText   = slotKnown ? `${fmtPct(slotPct)}%` : '—';
  const slotUp     = slotKnown ? slotPct >= 0 : true;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Kicker>Markets · BTC / USD</Kicker>
        <RangeButtons
          value={range}
          onChange={onRangeChange ?? NOOP}
          note={rangeNote}
          fontSize={u(11)}
          padX={u(6)}
          minHeight={u(20)}
          gap={u(2)}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Num size="hero" value={headText} />
        <div style={{ fontFamily: T.num, fontSize: u(22), fontWeight: 400, color: slotKnown ? (slotUp ? T.green : T.red) : T.ink3, paddingBottom: u(10), fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
          {slotKnown ? `${slotUp ? '▲' : '▼'} ${slotText}` : slotText}
          {hover && <span style={{ fontSize: u(13), color: T.ink3, marginLeft: u(6) }}>since</span>}
          {rangeSuffix && <span style={{ fontSize: u(13), color: T.ink3, marginLeft: u(6) }}>{rangeSuffix}</span>}
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
        <LineChart color={T.orange} points={series} domain={domain} dimmed={!!(chart.stale || chart.aged)} chipFormat={chipFormat} vwap={range === '24h' ? btc.data?.vwap : undefined} fill onHover={setHover} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.num, fontSize: u(10), color: T.ink3 }}>
        {axisLabels(range, domain[1]).map((label, i) => <span key={i}>{label}</span>)}
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
