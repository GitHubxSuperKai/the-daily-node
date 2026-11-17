// FLOW: On desktop, with only the miner-offline alert switched on, open the dashboard
//       while the synthetic fleet has one miner offline.
// EXPECT: The sidebar's Alerts panel counts one new alert ("1 in 24h · 1 new") and
//         lists it as "Miner offline", naming the offline miner's address, 192.0.2.12.
// WHY: useAlerts fires the miner-offline alert once the offline count crosses its
//      threshold (checkMinerOfflineThreshold: more than 0), and AlertsPanel is where a
//      fired alert stays listed. The count comes from the synthetic
//      tests/e2e/fixtures/backend/miners.js, so the crossing is the same on every run.
//      The other default-on alerts are switched off first, because their inputs are
//      recorded: block time compares the recorded mempool tip with the fixed clock, and
//      fee spike compares the recorded fee with its threshold. Either can fire after a
//      fixture refresh, and a second alert would change the count and could take the
//      panel's only laid-out row.
//      The panel shows as many rows as the rail has room for (useFitRows). At the
//      desktop project's size the rail has no spare row with these fixtures, so the row
//      is laid out but hidden (visibility: hidden, kept for measuring). The flow checks
//      that the row is there and that the visible count reports it, not that it fits.
import { test, expect } from '../harness.js';

// v2 prefs (src/utils/v2prefs.js, key dn.prefs.v2), merged over the defaults on load:
// fee spike and block time off. Miner offline stays on and price stays off, as by default.
const ONLY_MINER_OFFLINE = {
  version: 2,
  alerts: { fee: { enabled: false }, blockTime: { enabled: false } },
};

test('a crossed miner-offline threshold lists its alert @fixtures-only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.addInitScript(prefs => {
    localStorage.setItem('dn.prefs.v2', JSON.stringify(prefs));
  }, ONLY_MINER_OFFLINE);
  await page.goto('/');
  const alerts = page.getByRole('region', { name: 'Alerts' });
  await expect(alerts).toBeVisible();

  await expect(alerts.getByText('1 in 24h · 1 new', { exact: true })).toBeVisible();
  // The row's label, and its message with the "Miner offline: " prefix dropped
  // (AlertsPanel shortMessage). Presence, not visibility: the row is the hidden one
  // useFitRows keeps for measuring (see WHY). A taller viewport does not make room:
  // index.html scales a fixed 1920x1080 canvas to the width, so at 1440 wide the
  // Alerts region measured 33.125px tall at every height from 900 to 1600, short of
  // the 16px header plus one 31.5px row. So a panel that laid rows out and never
  // displayed them would still pass here.
  await expect(alerts.getByText('Miner offline', { exact: true })).toHaveCount(1);
  await expect(alerts.getByText('192.0.2.12', { exact: true })).toHaveCount(1);
});
