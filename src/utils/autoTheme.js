// Pure edge-trigger decision for scheduled (sunrise/sunset) theme switching.
//
// prevShouldBeDark — last observed "should be dark" value (null on first eval)
// shouldBeDark     — current computed value from clock vs sunrise/sunset hours
// dark             — the app's current dark-mode state
//
// Returns { update, flip }:
//   update — whether to store shouldBeDark as the new prev (a real crossing)
//   flip   — whether to toggle the theme now (only at a crossing, and only if
//            the current theme disagrees with shouldBeDark)
function themeFlipDecision(prevShouldBeDark, shouldBeDark, dark) {
  if (shouldBeDark === prevShouldBeDark) return { update: false, flip: false };
  return { update: true, flip: shouldBeDark !== dark };
}

// Minutes since local midnight for an "HH:MM" string, or null if it is not one.
function hmToMinutes(hm) {
  const m = typeof hm === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(hm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Whether the theme should be dark at `now`, from the weather data's sunrise/sunset.
// Compares minutes, not hours: wxSunriseHr/wxSunsetHr are truncated to the hour, which
// switched the theme up to 59 minutes early every day. The hour fields are only a
// fallback for data without the HH:MM strings. Returns null when neither is usable.
function shouldBeDarkAt(now, wx) {
  if (!wx) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let rise = hmToMinutes(wx.wxSunrise);
  let set = hmToMinutes(wx.wxSunset);
  if (rise == null || set == null) {
    if (wx.wxSunriseHr == null || wx.wxSunsetHr == null) return null;
    rise = wx.wxSunriseHr * 60;
    set = wx.wxSunsetHr * 60;
  }
  return nowMin < rise || nowMin >= set;
}

export { themeFlipDecision, shouldBeDarkAt };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { themeFlipDecision, shouldBeDarkAt };
}
