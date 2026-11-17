// FLOW: On desktop, pick a chart range other than the default (7D), then reload the
//       page; separately, open the dashboard in a fresh session.
// EXPECT: The click selects 7D and redraws the price line, and 7D is still selected
//         after the reload. A fresh session starts on the default range, 24H.
// WHY: The range lives in v2 prefs (`chart.range`). A click that stops saving it, or
//      a load that stops reading it, resets the chart on every visit.
import { test, expect } from '../harness.js';

const rangeButton = (page, label) =>
  page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: label, exact: true });

// The price line: LineChart's stroke path (its fill path is the area under it).
const priceLine = page => page.locator('[data-chart-scrub="true"] path[fill="none"]');

test('range change redraws and persists', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'true');
  await expect(priceLine(page)).toHaveAttribute('d', /\S/);
  // Every fixture answers at once; once the network is idle the 24H line is final.
  await page.waitForLoadState('networkidle');
  const before = await priceLine(page).getAttribute('d');

  await rangeButton(page, '7D').click();
  await expect(rangeButton(page, '7D')).toHaveAttribute('aria-pressed', 'true');
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => priceLine(page).getAttribute('d')).not.toBe(before);

  await page.reload();
  await expect(rangeButton(page, '7D')).toHaveAttribute('aria-pressed', 'true');
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'false');
});

// A separate test, so it gets its own harnessed context: nothing the test above saved
// can leak in.
test('fresh session starts on the default range', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await expect(rangeButton(page, '24H')).toHaveAttribute('aria-pressed', 'true');
  for (const label of ['1H', '7D', '30D', '1Y']) {
    await expect(rangeButton(page, label)).toHaveAttribute('aria-pressed', 'false');
  }
});
// verify-map positive control (throwaway PR, do not merge)
