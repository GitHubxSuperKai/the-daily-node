const PREFS_KEY     = 'dn.prefs.v2';
const PREFS_VERSION = 2;

const PREFS_DEFAULTS = {
  version: PREFS_VERSION,
  alerts: {
    fee:          { enabled: true,  threshold: 50,  cooldownMin: 30 },
    blockTime:    { enabled: true,  cooldownMin: 60 },
    minerOffline: { enabled: true,  cooldownMin: 10 },
    price:        { enabled: false, pctThreshold: 5, windowMin: 60, cooldownMin: 60 },
  },
  feeds: {
    bitcoinMagazine: true,
    coindesk:        true,
    newsBitcoin:     true,
  },
  intervals: {
    price:   30,
    chain:   60,
    weather: 900,
    rss:     300,
    bitaxe:  30,
  },
  theme: 'auto',
  mempool: {
    baseUrl: '',            // empty string = use public mempool.space
    fallbackToPublic: true, // if self-hosted fails, fall back to mempool.space
  },
};

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      key in defaults &&
      typeof defaults[key] === 'object' &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key], overrides[key] ?? {});
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function loadV2Prefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (!raw || raw.version !== PREFS_VERSION) return { ...PREFS_DEFAULTS };
    return deepMerge(PREFS_DEFAULTS, raw);
  } catch {
    return { ...PREFS_DEFAULTS };
  }
}

function saveV2Prefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
  } catch {
    // localStorage unavailable (private browsing, storage quota)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadV2Prefs, saveV2Prefs, deepMerge, PREFS_DEFAULTS, PREFS_KEY, PREFS_VERSION };
}
