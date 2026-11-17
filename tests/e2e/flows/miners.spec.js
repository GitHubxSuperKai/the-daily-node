// FLOW: On desktop, open the dashboard with the synthetic BitAxe fleet (three miners,
//       the second one offline).
// EXPECT: The Field Report lists all three rigs and reads "2/3 active". The offline rig
//         shows its unreachable state: dimmed, with a dash in every stat column, while
//         an online rig shows its numbers.
// WHY: An offline miner is the state a fleet owner most needs to see. MinerRow decides
//      it (getMinerStatus); a row that stops showing it makes a dead rig look healthy.
//      The offline entry in tests/e2e/fixtures/backend/miners.js carries no `data`, so
//      the row can only name it by its address (getMinerName): 192.0.2.12 reads "rig-12".
import { test, expect } from '../harness.js';

// A rig's name, as MinerRow prints it. Not an exact match: an online rig on old
// firmware carries an "UPDATE" badge inside the same element (miner-3 does).
const rigName = (page, name) => page.getByText(name);

// The rig's name cell. MinerRow's cells are flat children of one CSS grid with no row
// element around them, so a row's stat cells are the seven divs that follow its name
// cell (TH/s, J/T, Uptime, Shares, ASIC°, VR°, Watts).
const nameCell = (page, name) => rigName(page, name).locator('xpath=..');
const statCells = (page, name) => nameCell(page, name).locator('xpath=following-sibling::div[position() <= 7]');

test('the fleet lists every miner and shows the offline one @fixtures-only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');

  for (const name of ['miner-1', 'rig-12', 'miner-3']) {
    await expect(rigName(page, name)).toBeVisible();
  }
  await expect(page.getByText(/^2\/3 active$/)).toBeVisible();

  // Offline: MinerRow dims the row to 0.4 and prints a dash in every stat column.
  await expect(nameCell(page, 'rig-12')).toHaveCSS('opacity', '0.4');
  await expect(statCells(page, 'rig-12')).toHaveText(['—', '—', '—', '—', '—', '—', '—']);

  // Online, for contrast: full opacity and real numbers (miners.js: 1210.5 GH/s).
  await expect(nameCell(page, 'miner-1')).toHaveCSS('opacity', '1');
  await expect(statCells(page, 'miner-1').first()).toHaveText('1.21');
});
