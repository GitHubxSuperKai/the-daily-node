import React from 'react';
import { useT } from '../theme';
import Num from './Num';
import Kicker from './Kicker';
import WxGlyph from './WxGlyph';
import { fmtHour, wmoIcon, wmoSpeed } from '../utils/formatting';

function Weather({ weather, prefs }) {
  const T = useT();
  const wx = weather.data;

  if (!wx) {
    return (
      <div>
        <Kicker>Weather</Kicker>
        <div style={{ fontFamily: T.mono, fontSize: u(12), color: T.ink3, marginTop: u(8) }}>
          {weather.err ? 'weather unavailable' : 'loading…'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Kicker>Weather</Kicker>
      <div style={{ display: 'flex', alignItems: 'center', gap: u(12), marginTop: u(8) }}>
        <WxGlyph kind={wmoIcon(wx.wxCode, new Date().getHours(), wx.wxWindSpeed, wx.wxSunriseHr, wx.wxSunsetHr)} size={48} speed={wmoSpeed(wx.wxCode, wx.wxWindSpeed)} />
        <div>
          <Num size="lg" value={`${wx.temp}°`} unit={prefs.tempUnit === 'celsius' ? 'C' : 'F'} />
          <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(12), color: T.ink2, marginTop: u(3) }}>
            {wx.wxCond} · H{wx.wxHi} L{wx.wxLo}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: u(4), marginTop: u(12), paddingTop: u(10), borderTop: `1px solid ${T.rule3}` }}>
        {wx.hourly.map((h, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: u(10), color: T.ink3 }}>{fmtHour(h.hr, prefs.timeFormat)}</div>
            <div style={{ margin: `${u(3)} auto` }}><WxGlyph kind={wmoIcon(h.code, h.hr, null, wx.wxSunriseHr, wx.wxSunsetHr)} size={24} speed={wmoSpeed(h.code)} /></div>
            <Num size="xs" value={`${h.t}°`} />
            {h.pop >= 30 && <div style={{ fontFamily: T.mono, fontSize: u(9), color: T.ink3, marginTop: u(1) }}>{h.pop}%</div>}
            {h.precip > 0 && <div style={{ fontFamily: T.mono, fontSize: u(9), color: T.ink3 }}>{h.precip.toFixed(1)}mm</div>}
          </div>
        ))}
      </div>
      {/* 3×2 stat grid */}
      {(() => {
        const curHour = new Date().getHours();
        const isNight = wx.wxSunriseHr != null && wx.wxSunsetHr != null
          ? (curHour < wx.wxSunriseHr || curHour >= wx.wxSunsetHr)
          : (curHour < 6 || curHour >= 20);
        const uv = isNight ? (wx.wxUVIndexTomorrow ?? 0) : (wx.wxUVIndex ?? 0);
        const uvColor = uv >= 8 ? T.red : uv >= 6 ? T.orange : uv < 3 ? T.green : T.ink;
        const uvLabel = uv >= 8 ? 'Very High' : uv >= 6 ? 'High' : uv >= 3 ? 'Moderate' : 'Low';
        const uvCellLabel = isNight ? 'UV Tomorrow' : 'UV Index';
        const br = `1px solid ${T.rule3}`;
        const cellL  = { padding: `${u(8)} ${u(8)} ${u(8)} 0`,  borderRight: br };
        const cellM  = { padding: `${u(8)}`,                     borderRight: br };
        const cellR  = { padding: `${u(8)} 0 ${u(8)} ${u(8)}` };
        const cellLB = { padding: `${u(8)} ${u(8)} 0 0`,         borderRight: br, borderTop: br };
        const cellMB = { padding: `${u(8)} ${u(8)} 0 ${u(8)}`,  borderRight: br, borderTop: br };
        const cellRB = { padding: `${u(8)} 0 0 ${u(8)}`,         borderTop: br };
        const lbl = { fontFamily: T.sans, fontSize: u(8), fontWeight: 600, letterSpacing: u(1.6), textTransform: 'uppercase', color: T.ink3, marginBottom: u(3) };
        const val = { fontFamily: T.mono, fontSize: u(13), fontWeight: 500, letterSpacing: -0.5, lineHeight: 1, color: T.ink };
        const sub = { fontFamily: T.mono, fontSize: u(9), color: T.ink3, marginTop: u(2) };
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: u(10), borderTop: br }}>
            <div style={cellL}>
              <div style={lbl}>Feels Like</div>
              <div style={val}>{wx.feels}°{prefs.tempUnit === 'celsius' ? 'C' : 'F'}</div>
              <div style={sub}>H{wx.wxHi} · L{wx.wxLo}</div>
            </div>
            <div style={cellM}>
              <div style={lbl}>Humidity</div>
              <div style={val}>{wx.wxHum}</div>
              {wx.wxSunrise && <div style={sub}>↑{wx.wxSunrise} ↓{wx.wxSunset}</div>}
            </div>
            <div style={cellR}>
              <div style={lbl}>Dew Point</div>
              <div style={val}>{wx.wxDewPoint != null ? `${wx.wxDewPoint}°` : '—'}</div>
            </div>
            <div style={cellLB}>
              <div style={lbl}>Wind</div>
              <div style={val}>{wx.wxWind}</div>
              {wx.wxGusts != null && <div style={sub}>gusts {wx.wxGusts} mph</div>}
            </div>
            <div style={cellMB}>
              <div style={lbl}>{uvCellLabel}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: u(4) }}>
                <div style={{ ...val, color: uvColor }}>{uv}</div>
                <div style={{ fontFamily: T.sans, fontSize: u(8), fontWeight: 600, color: uv >= 6 ? uvColor : T.ink3 }}>{uvLabel}</div>
              </div>
              <div style={{ height: u(2), background: T.rule3, borderRadius: 2, marginTop: u(5) }}>
                <div style={{ height: '100%', width: `${Math.min(uv / 11, 1) * 100}%`, background: uvColor, borderRadius: 2 }} />
              </div>
            </div>
            <div style={cellRB}>
              <div style={lbl}>Pressure</div>
              <div style={val}>{wx.wxPressure != null ? `${wx.wxPressure}` : '—'}</div>
              <div style={sub}>hPa</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Weather;
