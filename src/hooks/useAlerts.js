import React from 'react';
import { checkFeeThreshold, checkBlockTimeThreshold, checkMinerOfflineThreshold, checkPriceThreshold } from '../utils/alertThresholds.js';

// Fired alerts stay listed for a day (the desktop sidebar's Alerts section) and survive a
// reload: they are kept in localStorage, with dismissed ones removed.
const HISTORY_KEY = 'dn.alerts.v1';
const HISTORY_MS = 24 * 60 * 60 * 1000;

const isAlert = a => a && typeof a.id === 'string' && typeof a.type === 'string'
  && typeof a.message === 'string' && Number.isFinite(a.ts);

function loadAlertHistory(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(raw) ? raw.filter(a => isAlert(a) && now - a.ts < HISTORY_MS) : [];
  } catch {
    return [];
  }
}

function saveAlertHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable (private browsing, storage quota): the list lasts until reload
  }
}

function useAlerts(triggers, prefs) {
  const { fastFee, msSinceLastBlock, miners, btcPrice, priceHistory } = triggers;
  const alertPrefs = prefs.alerts;

  const [toasts, setToasts] = React.useState([]);
  // Newest first.
  const [history, setHistory] = React.useState(() => loadAlertHistory());
  const historyLoaded = React.useRef(false);
  React.useEffect(() => {
    // Skip the first run: it would write back what was just read.
    if (!historyLoaded.current) { historyLoaded.current = true; return; }
    saveAlertHistory(history);
  }, [history]);
  const cooldowns = React.useRef({});
  const pendingTimers = React.useRef([]);

  const alertPrefsRef = React.useRef(alertPrefs);
  alertPrefsRef.current = alertPrefs;

  const fire = React.useCallback((type, message) => {
    const now = Date.now();
    const ap = alertPrefsRef.current;
    const cooldownMs = (ap[type]?.cooldownMin ?? 30) * 60 * 1000;
    if (now - (cooldowns.current[type] ?? 0) < cooldownMs) return;
    cooldowns.current[type] = now;

    const id = `${type}-${now}`;
    setToasts(prev => [...prev, { id, type, message, ts: now }]);
    setHistory(prev => [{ id, type, message, ts: now }, ...prev.filter(a => now - a.ts < HISTORY_MS)]);
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

export { useAlerts, loadAlertHistory, HISTORY_KEY, HISTORY_MS };
