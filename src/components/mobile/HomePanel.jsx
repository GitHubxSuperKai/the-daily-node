import React from 'react';
import { useT } from '../../theme.js';
import { StatusTile } from './StatusTile.jsx';
import { WxGlyph } from '../WxGlyph.jsx';
import {
  fmtPrice, fmtPct, fmtMempoolMB, fmtBlockTime, wmoIcon,
} from '../../utils/formatting.js';
import CONFIG from '../../config.js';
import { sourceFreshness } from '../../utils/freshness.js';

function HomePanel({ clock, btc, chain, bitaxe, weather, rss, prefs, onNavigate }) {
  const T = useT();
  const [fleetExpanded, setFleetExpanded] = React.useState(false);

  const miners = bitaxe.miners || [];
  const onlineCount = miners.filter(m => m.online).length;
  const minerCount  = miners.length;
  const totalHashTHs = miners.reduce((s, m) => s + (m.online ? (m.data ? m.data.hashRate || 0 : 0) : 0), 0) / 1000;
  const hottest = miners.reduce((max, m) => {
    const t = m.online && m.data ? m.data.temp : null;
    return t != null && t > max ? t : max;
  }, 0);

  const wx = weather && weather.data;
  const tempUnit = prefs.tempUnit === 'celsius' ? '°C' : '°F';
  const lead = rss && rss.items && rss.items[0];

  const btcChange = btc.data ? btc.data.chgPct : null;
  const btcUp = btcChange != null && btcChange >= 0;

  const onlineCountForFeed = bitaxe.miners ? bitaxe.miners.filter(m => m.online).length : 0;
  const minerCountForFeed  = bitaxe.miners ? bitaxe.miners.length : 0;

  const freshNow = Date.now();
  const lastBlockTs = chain.recentBlocks?.[0]?.timestamp ?? null;
  const feedSources = [
    { id: 'btc',     label: 'BTC',     state: sourceFreshness({ hasData: !!btc.data, err: btc.error, lastOk: btc.lastOk, interval: CONFIG.REFRESH_INTERVALS.price }, freshNow) },
    { id: 'chain',   label: 'Chain',   state: sourceFreshness({ hasData: !!chain.data, err: chain.error, lastOk: chain.lastOk, interval: CONFIG.REFRESH_INTERVALS.chain, contentAgeMs: lastBlockTs ? freshNow - lastBlockTs * 1000 : null, contentMaxMs: CONFIG.CONTENT_STALE.chain }, freshNow) },
    { id: 'miners',  label: 'Miners',  state: sourceFreshness({ hasData: onlineCountForFeed > 0, err: bitaxe.err, lastOk: bitaxe.lastOk, interval: bitaxe.interval }, freshNow) },
    { id: 'weather', label: 'Weather', state: sourceFreshness({ hasData: !!weather.data, err: weather.err, lastOk: weather.lastOk, interval: weather.interval }, freshNow) },
    { id: 'rss',     label: 'RSS',     state: sourceFreshness({ hasData: rss.items && rss.items.length > 0, err: rss.err, lastOk: rss.lastOk, interval: rss.interval }, freshNow) },
  ];
  const dotColor = (state) => (state === 'fresh' ? T.green : state === 'stale' ? T.orange : T.red);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      padding: '14px 14px 80px',
      background: T.paper,
    }}>
      {/* BTC — full width */}
      <StatusTile
        label="BTC / USD"
        fullWidth
        onClick={() => onNavigate('bitcoin')}
        ariaLabel="BTC price — open detail"
      >
        <div data-testid="btc-tile" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: T.numDisplay, fontSize: 32, fontWeight: 700, color: T.ink, letterSpacing: -1 }}>
            {btc.data ? fmtPrice(btc.data.price) : '—'}
          </span>
          {btcChange != null && (
            <span style={{ fontFamily: T.num, fontSize: 14, color: btcUp ? T.green : T.red }}>
              {btcUp ? '▲' : '▼'} {fmtPct(btcChange)}
            </span>
          )}
        </div>
      </StatusTile>

      {/* Fleet — full width, expandable */}
      <StatusTile
        label="Fleet"
        fullWidth
        onClick={() => setFleetExpanded(v => !v)}
        ariaLabel="Toggle fleet detail"
      >
        <div data-testid="fleet-tile" style={{ fontFamily: T.num, fontSize: 16, color: T.ink }}>
          {minerCount === 0
            ? <span style={{ color: T.ink3 }}>No miners configured</span>
            : <>
                {onlineCount}/{minerCount} online · {totalHashTHs.toFixed(2)} TH/s
                {hottest > 0 && <span style={{ color: T.ink3 }}> · hottest {Math.round(hottest)}°C</span>}
              </>
          }
        </div>
        {fleetExpanded && miners.length > 0 && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${T.rule3}`, paddingTop: 8 }}>
            {miners.map(m => (
              <div
                key={m.ip}
                data-testid={`fleet-row-${m.ip}`}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: T.sans, fontSize: 12 }}
              >
                <span style={{ color: T.ink }}>{(m.data && m.data.hostname) || m.ip}</span>
                <span style={{ color: m.online ? T.green : T.red }}>
                  {m.online ? `${((m.data.hashRate || 0) / 1000).toFixed(1)} GH/s` : 'offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </StatusTile>

      {/* Status dots — full width */}
      <StatusTile label="Feeds" fullWidth>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {feedSources.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: dotColor(s.state),
                display: 'inline-block',
              }} />
              <span style={{ fontFamily: T.sans, fontSize: 10, color: T.ink2, textTransform: 'uppercase', letterSpacing: 1 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </StatusTile>

      {/* Mempool — half */}
      <StatusTile
        label="Mempool"
        onClick={() => onNavigate('bitcoin')}
        ariaLabel="Mempool — open detail"
      >
        <div style={{ fontFamily: T.num, fontSize: 18, color: T.ink }}>
          {chain.data ? fmtMempoolMB(chain.data.mempoolBytes) : '—'}
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 10, color: T.ink3, marginTop: 2 }}>
          {chain.data ? `${chain.data.feeFast} sat/vB` : '—'}
        </div>
      </StatusTile>

      {/* Block — half */}
      <StatusTile
        label="Block"
        onClick={() => onNavigate('bitcoin')}
        ariaLabel="Block time — open detail"
      >
        <div style={{ fontFamily: T.num, fontSize: 18, color: T.ink }}>
          {chain.data ? fmtBlockTime(chain.data.blockTimeMs) : '—'}
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 10, color: T.ink3, marginTop: 2 }}>
          {chain.data && chain.data.height ? `#${chain.data.height.toLocaleString()}` : '—'}
        </div>
      </StatusTile>

      {/* Weather — half */}
      <StatusTile label="Weather">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {wx && (
            <WxGlyph
              kind={wmoIcon(wx.wxCode, (() => { const h = parseInt(clock.timeHM.split(':')[0], 10); return clock.amPm === 'PM' && h !== 12 ? h + 12 : clock.amPm === 'AM' && h === 12 ? 0 : h; })(), wx.wxWindSpeed, wx.wxSunriseHr, wx.wxSunsetHr)}
              size={28}
              speed={1}
            />
          )}
          <div>
            <div style={{ fontFamily: T.num, fontSize: 18, color: T.ink }}>
              {wx ? `${wx.temp}${tempUnit}` : `—${tempUnit}`}
            </div>
            <div style={{ fontFamily: T.sans, fontSize: 10, color: T.ink3 }}>
              {wx ? wx.wxCond : '—'}
            </div>
          </div>
        </div>
      </StatusTile>

      {/* Clock — half */}
      <StatusTile label="Local">
        <div style={{ fontFamily: T.num, fontSize: 18, color: T.ink }}>
          {clock.timeHM}{clock.amPm ? ` ${clock.amPm}` : ''}
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 10, color: T.ink3, marginTop: 2 }}>
          {clock.dayStr || ''}
        </div>
      </StatusTile>

      {/* Lead headline — full width */}
      {lead && (
        <StatusTile
          label="Top Story"
          fullWidth
          onClick={() => onNavigate('news')}
          ariaLabel="Open News tab"
        >
          <div data-testid="lead-tile" style={{
            fontFamily: T.serif, fontSize: 16, fontWeight: 700,
            lineHeight: 1.2, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {lead.hed}
          </div>
        </StatusTile>
      )}
    </div>
  );
}

HomePanel = React.memo(HomePanel);

export { HomePanel };
