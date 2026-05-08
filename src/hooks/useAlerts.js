function useAlerts(triggers, prefs) {
  const { fastFee, msSinceLastBlock, miners, btcPrice, priceHistory } = triggers;
  const alertPrefs = prefs.alerts;

  const [toasts, setToasts] = React.useState([]);
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

  return { toasts };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { useAlerts };
}
