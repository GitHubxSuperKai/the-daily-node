// FLOW: On desktop, open Settings, untick every enabled alert under Alerts (Fee spike,
//       Block time drift, Miner offline; Price move is off by default), and Save.
// EXPECT: The dialog closes and the sidebar's Alerts panel switches to its off state:
//         the count reads "Off" and the "All alerts are off" note shows.
// WHY: The Settings toggles only take effect through Save (onSaveV2). A broken save
//      path, or a panel that stops reading the prefs it is given, leaves the dashboard
//      ignoring its own settings. No Settings toggle hides a whole panel, so the alert
//      toggles and the panel they control stand in for "a toggle changes its panel".
import { test, expect } from '../harness.js';

const OFF_NOTE = 'All alerts are off. Turn them on in Settings › Alerts.';

test('turning every alert off switches the Alerts panel off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  const alerts = page.getByRole('region', { name: 'Alerts' });
  await expect(alerts).toBeVisible();
  await expect(alerts.getByText(OFF_NOTE)).toHaveCount(0);
  await expect(alerts.getByText('Off', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  for (const label of ['Fee spike', /^Block time drift/, 'Miner offline']) {
    const box = dialog.getByLabel(label, { exact: typeof label === 'string' });
    await expect(box).toBeChecked();
    await box.uncheck();
  }
  await expect(dialog.getByLabel(/^Price move/)).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(alerts.getByText('Off', { exact: true })).toBeVisible();
  await expect(alerts.getByText(OFF_NOTE)).toBeVisible();
});
