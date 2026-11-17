// FLOW: On a phone-sized screen (430 wide, under App's 900px breakpoint), open the
//       dashboard; step through every section in the bottom bar; on the Bitcoin tab
//       pick a chart range; open Settings from the header.
// EXPECT: MobileApp renders, not the desktop CommandCenter, and its Home tile shows the
//         Kraken fixture price. Each bar button opens its section and marks itself
//         current. A range button selects that range and redraws the price line. The
//         header's gear opens the Settings dialog, and Save closes it.
// WHY: App swaps the whole layout at 900px (useViewportMode), so a phone sees none of
//      the desktop flows. This flow is the phone's own check that the same data
//      renders and its navigation works.
import { test, expect } from '../harness.js';

const sections = page => page.getByRole('navigation', { name: 'Sections' });
const tab = (page, label) => sections(page).getByRole('button', { name: label, exact: true });

const rangeButton = (page, label) =>
  page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: label, exact: true });

// The price line: LineChart's stroke path (its fill path is the area under it).
const priceLine = page => page.locator('[data-chart-scrub="true"] path[fill="none"]');

test('MobileApp renders the Kraken price @fixtures-only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  await expect(sections(page)).toBeVisible();
  // Kraken ticker fixture: last trade 64913.9, which fmtPrice rounds to $64,914.
  await expect(page.getByTestId('btc-tile')).toContainText('$64,914');
  // The desktop layout's Settings button belongs to CommandCenter only.
  await expect(page.getByRole('button', { name: '⚙ Settings', exact: true })).toHaveCount(0);
});

test('the bottom bar reaches each section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('btc-tile')).toBeVisible();

  // A marker for each section: BitcoinPanel's range buttons, MinersPanel's fleet
  // summary line ("2/3 online · ..."), NewsPanel's "Bitcoin News" heading, HomePanel's
  // BTC tile. The fleet line is not unique: HomePanel's fleet tile prints the same
  // "N/M online · " text, so the Miners step also checks that the Home tile is gone.
  const steps = [
    ['Bitcoin', page.getByRole('group', { name: 'Chart range' })],
    ['Miners', page.getByText(/^\d+\/\d+ online · /), page.getByTestId('fleet-tile')],
    ['News', page.getByText('Bitcoin News', { exact: true })],
    ['Home', page.getByTestId('btc-tile')],
  ];
  for (const [label, marker, absent] of steps) {
    await tab(page, label).click();
    await expect(tab(page, label)).toHaveAttribute('aria-current', 'page');
    for (const [other] of steps) {
      if (other !== label) await expect(tab(page, other)).not.toHaveAttribute('aria-current', 'page');
    }
    await expect(marker).toBeVisible();
    if (absent) await expect(absent).toHaveCount(0);
  }
});

test('a range button on the Bitcoin tab changes the chart', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  await tab(page, 'Bitcoin').click();
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'true');
  await expect(priceLine(page)).toHaveAttribute('d', /\S/);
  // Every fixture answers at once; once the network is idle the 24H line is final.
  await page.waitForLoadState('networkidle');
  const before = await priceLine(page).getAttribute('d');

  await rangeButton(page, '7D').click();
  await expect(rangeButton(page, '7D')).toHaveAttribute('aria-pressed', 'true');
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => priceLine(page).getAttribute('d')).not.toBe(before);
});

test('the header gear opens Settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
});
