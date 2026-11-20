// FLOW: On desktop, open Settings, untick the CoinDesk feed, and Save.
// EXPECT: Without a reload, none of CoinDesk's headlines are left in the Bitcoin news
//         column, while the other default feeds' headlines still are.
// WHY: The feed list in v2 prefs decides which feeds are fetched (applyV2ToConfig in
//      src/App.jsx). A feed the user turned off must stop showing up, and Save must
//      refetch the news at once rather than at the next 5-minute news interval.
import { test, expect } from '../harness.js';

// Headlines from tests/e2e/fixtures/backend/rss-coindesk.js and rss-newsBitcoin.js.
// Every CoinDesk headline starts "Synthetic Desk:", every News.Bitcoin.com one
// "Synthetic News:".
const COINDESK = /^Synthetic Desk: /;
const NEWS_BITCOIN = 'Synthetic News: Bitcoin Lightning capacity grows again';

test('a feed turned off leaves the news column @fixtures-only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  const news = page.getByTestId('news-column');
  await expect(news.getByText(COINDESK)).toHaveCount(3);
  await expect(news.getByText(NEWS_BITCOIN, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '⚙ Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const coindesk = dialog.getByLabel('CoinDesk', { exact: true });
  await expect(coindesk).toBeChecked();
  await coindesk.uncheck();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(news.getByText(NEWS_BITCOIN, { exact: true })).toBeVisible();
  await expect(news.getByText(COINDESK)).toHaveCount(0);
});
