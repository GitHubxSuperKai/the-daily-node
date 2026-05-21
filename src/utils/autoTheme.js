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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { themeFlipDecision };
}
