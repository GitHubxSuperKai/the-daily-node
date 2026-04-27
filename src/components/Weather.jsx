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
        <div style={{ fontFamily:T.mono, fontSize:12, color:T.ink3, marginTop:8 }}>
          {weather.err ? 'weather unavailable' : 'loading…'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Kicker>Weather</Kicker>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8 }}>
        <WxGlyph kind={wmoIcon(wx.wxCode, new Date().getHours(), wx.wxWindSpeed, wx.wxSunriseHr, wx.wxSunsetHr)} size={48} speed={wmoSpeed(wx.wxCode, wx.wxWindSpeed)} />
        <div>
          <Num size="lg" value={`${wx.temp}°`} unit={prefs.tempUnit === 'celsius' ? 'C' : 'F'} />
          <div style={{ fontFamily:T.body, fontStyle:'italic', fontSize:12, color:T.ink2, marginTop:3 }}>
            {wx.wxCond} · feels {wx.feels}° · H{wx.wxHi} L{wx.wxLo}
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:4, marginTop:12, paddingTop:10, borderTop:`1px solid ${T.rule3}` }}>
        {wx.hourly.map((h,i)=>(
          <div key={i} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:T.mono, fontSize:10, color:T.ink3 }}>{fmtHour(h.hr, prefs.timeFormat)}</div>
            <div style={{ margin:'3px auto' }}><WxGlyph kind={wmoIcon(h.code, h.hr, null, wx.wxSunriseHr, wx.wxSunsetHr)} size={24} speed={wmoSpeed(h.code)} /></div>
            <Num size="xs" value={`${h.t}°`} />
            {h.pop >= 30 && <div style={{ fontFamily:T.mono, fontSize:9, color:T.ink3, marginTop:1 }}>{h.pop}%</div>}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, fontFamily:T.mono, fontSize:10, color:T.ink3 }}>
        <span>wind {wx.wxWind}</span><span>hum {wx.wxHum}</span>
      </div>
    </div>
  );
}

export default Weather;
