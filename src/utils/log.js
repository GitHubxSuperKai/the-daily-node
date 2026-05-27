// Debug-gated logger.
// Enabled when ?debug=1 in the URL OR localStorage.dailynode-debug === '1'.
// Errors always print regardless — the noise reduction is about info/warn.

function isDebugEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location && window.location.search.includes('debug=1')) return true;
    if (window.localStorage && window.localStorage.getItem('dailynode-debug') === '1') return true;
  } catch (_) {
    // localStorage can throw in private-mode Safari etc.
  }
  return false;
}

const DEBUG = isDebugEnabled();

export const log = {
  // Errors always print — they signal something the user might need to report.
  error: (...args) => console.error('[DN]', ...args),
  // Warn + info are gated.
  warn:  (...args) => { if (DEBUG) console.warn('[DN]', ...args); },
  info:  (...args) => { if (DEBUG) console.info('[DN]', ...args); },
  // Convenience alias — most existing call sites are console.log.
  log:   (...args) => { if (DEBUG) console.log('[DN]', ...args); },
};

export default log;
