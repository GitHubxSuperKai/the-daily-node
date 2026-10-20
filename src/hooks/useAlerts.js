import React from 'react';
import { checkFeeThreshold, checkBlockTimeThreshold, checkMinerOfflineThreshold, checkPriceThreshold } from '../utils/alertThresholds.js';

// Fired alerts stay listed for a day (the desktop sidebar's Alerts section) and survive a
// reload: they are kept in localStorage, with dismissed ones removed.
const HISTORY_KEY = 'dn.alerts.v1';
const HISTORY_MS = 24 * 60 * 60 * 1000;

const isAlert = a => a && typeof a.id === 'string' && typeof a.type === 'string'
  && typeof a.message === 'string' && Number.isFinite(a.ts);

// A future time (saved under a clock that ran ahead and was then corrected) is dropped:
// it would otherwise stay listed forever and hold that type's cooldown until then.
const isRecent = (ts, now) => ts <= now && now - ts < HISTORY_MS;

function loadAlertHistory(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(raw) ? raw.filter(a => isAlert(a) && isRecent(a.ts, now)) : [];
  } catch {
    return [];
  }
}

// Last fire time per type, saved apart from the list so a dismissed alert's cooldown
// survives a reload too.
const COOLDOWNS_KEY = 'dn.alerts.cooldowns.v1';

function loadCooldowns(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(COOLDOWNS_KEY));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, ts]) => Number.isFinite(ts) && isRecent(ts, now)));
  } catch {
    return {};
  }
}

function saveCooldowns(cooldowns) {
  try {
    localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(cooldowns));
  } catch {
    // localStorage unavailable: cooldowns last until reload, as before
  }
}

function saveAlertHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable (private browsing, storage quota): the list lasts until reload
  }
}

// Adds a fired alert to the history (newest first), dropping entries past 24 hours. A
// condition that keeps firing stays one row: when the newest row of the same type last
// fired within two cooldowns, it takes the new time and message, counts the repeat and
// keeps `since`, its first time. A longer gap, or a dismissed row, starts a new row.
function mergeAlert(history, alert, cooldownMs) {
  const live = history.filter(a => alert.ts - a.ts < HISTORY_MS);
  const i = live.findIndex(a => a.type === alert.type);
  if (i >= 0 && alert.ts - live[i].ts <= 2 * cooldownMs) {
    const prev = live[i];
    const merged = {
      ...prev, message: alert.message, ts: alert.ts,
      since: prev.since ?? prev.ts, count: (prev.count ?? 1) + 1,
    };
    return [merged, ...live.slice(0, i), ...live.slice(i + 1)];
  }
  return [alert, ...live];
}

function useAlerts(triggers, prefs) {
  const { fastFee, msSinceLastBlock, miners, btcPrice, priceHistory } = triggers;
  const alertPrefs = prefs.alerts;

  const [toasts, setToasts] = React.useState([]);
  // Newest first.
  const [history, setHistory] = React.useState(() => loadAlertHistory());
  // Last fire time per type. Loaded from storage (and the saved list, for history written
  // before the cooldowns were saved), so a reload, or a remount across the 900px
  // breakpoint, doesn't fire again, and list again, an alert whose cooldown is still
  // running, dismissed or not.
  const cooldowns = React.useRef(null);
  if (cooldowns.current === null) {
    cooldowns.current = loadCooldowns();
    for (const a of history) cooldowns.current[a.type] = Math.max(cooldowns.current[a.type] ?? 0, a.ts);
  }
  const historyLoaded = React.useRef(false);
  React.useEffect(() => {
    // Skip the first run: it would write back what was just read.
    if (!historyLoaded.current) { historyLoaded.current = true; return; }
    saveAlertHistory(history);
  }, [history]);
  const pendingTimers = React.useRef([]);

  const alertPrefsRef = React.useRef(alertPrefs);
  alertPrefsRef.current = alertPrefs;

  const fire = React.useCallback((type, message) => {
    const now = Date.now();
    const ap = alertPrefsRef.current;
    const cooldownMs = (ap[type]?.cooldownMin ?? 30) * 60 * 1000;
    if (now - (cooldowns.current[type] ?? 0) < cooldownMs) return;
    cooldowns.current[type] = now;
    saveCooldowns(cooldowns.current);

    const id = `${type}-${now}`;
    setToasts(prev => [...prev, { id, type, message, ts: now }]);
    setHistory(prev => mergeAlert(prev, { id, type, message, ts: now }, cooldownMs));
    const tid = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      pendingTimers.current = pendingTimers.current.filter(t => t !== tid);
    }, 8000);
    pendingTimers.current.push(tid);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('The Daily Node', { body: message, tag: type });
    }
  }, []); // stable — reads alertPrefsRef.current at call time

  React.useEffect(() => {
    return () => pendingTimers.current.forEach(clearTimeout);
  }, []);

  React.useEffect(() => {
    if (!alertPrefs.fee?.enabled) return;
    if (checkFeeThreshold(fastFee, alertPrefs.fee.threshold)) {
      fire('fee', `Fee spike: ${fastFee} sat/vB (threshold: ${alertPrefs.fee.threshold})`);
    }
  }, [fastFee, alertPrefs.fee, fire]);

  React.useEffect(() => {
    if (!alertPrefs.blockTime?.enabled) return;
    if (checkBlockTimeThreshold(msSinceLastBlock)) {
      fire('blockTime', `No block in ${Math.round(msSinceLastBlock / 60000)} minutes`);
    }
  }, [msSinceLastBlock, alertPrefs.blockTime, fire]);

  React.useEffect(() => {
    if (!alertPrefs.minerOffline?.enabled || !Array.isArray(miners)) return;
    const offline = miners.filter(m => !m.online);
    if (checkMinerOfflineThreshold(offline.length)) {
      fire('minerOffline', `Miner offline: ${offline.map(m => m.ip).join(', ')}`);
    }
  }, [miners, alertPrefs.minerOffline, fire]);

  React.useEffect(() => {
    if (!alertPrefs.price?.enabled || !Array.isArray(priceHistory)) return;
    if (checkPriceThreshold(
      btcPrice,
      priceHistory,
      alertPrefs.price.pctThreshold,
      alertPrefs.price.windowMin * 60,
    )) {
      fire('price', `BTC moved ≥${alertPrefs.price.pctThreshold}% in ${alertPrefs.price.windowMin}min`);
    }
  }, [btcPrice, priceHistory, alertPrefs.price, fire]);

  const dismiss = React.useCallback(id => {
    setHistory(prev => prev.filter(a => a.id !== id));
  }, []);

  return { toasts, history, dismiss };
}

export { useAlerts, loadAlertHistory, mergeAlert, HISTORY_KEY, HISTORY_MS, COOLDOWNS_KEY };
