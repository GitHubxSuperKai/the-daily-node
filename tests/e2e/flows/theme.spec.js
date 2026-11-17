// FLOW: On desktop, in daylight, click the Masthead theme switch; separately, open the
//       dashboard after sunset with the theme left on Auto (the default).
// EXPECT: The switch turns the light page dark. After sunset, Auto renders the dark
//         theme on its own.
// WHY: Auto theme compares the browser clock with the weather data's sunrise and
//      sunset (src/utils/autoTheme.js), so a regression there or in the switch shows
//      as the wrong theme. The switch is checked only right after the click, not
//      whether Auto later overrides it. Both clocks below sit on the weather
//      fixture's first day, 2026-11-17, whose sunrise is 05:41 and sunset 17:48.
//      Open-Meteo gives them as local times with utc_offset_seconds 0 and the
//      browser runs in UTC, so they read as UTC.
import { test, expect } from '../harness.js';

// LIGHT.paper and DARK.paper in src/theme.js, as the body background App sets.
const PAPER = { light: 'rgb(243, 238, 228)', dark: 'rgb(18, 17, 16)' };

const themeSwitch = page => page.getByTitle(/^Switch to (light|dark) mode$/);

// autoTheme.js sets no DOM marker of its own, so read the theme where it shows: the
// page background, and the Masthead switch's title, which offers the other mode.
async function expectTheme(page, mode) {
  await expect(page.locator('body')).toHaveCSS('background-color', PAPER[mode]);
  await expect(themeSwitch(page)).toHaveAttribute(
    'title',
    mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
}

// The weather panel's stat grid only renders once the forecast has loaded. Until then
// Auto has nothing to compare against, so a theme read before this proves nothing.
const weatherLoaded = page => expect(page.getByText('Feels Like', { exact: true })).toBeVisible();

test.describe('in daylight', () => {
  test.use({ now: '2026-11-17T12:00:00Z' });

  test('the manual switch changes the theme @fixtures-only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');
    await page.goto('/');
    await weatherLoaded(page);
    await expectTheme(page, 'light');

    await themeSwitch(page).click();
    await expectTheme(page, 'dark');
  });
});

test.describe('after sunset', () => {
  test.use({ now: '2026-11-17T18:30:00Z' });

  test('auto theme is dark after sunset @fixtures-only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop');
    await page.goto('/');
    await weatherLoaded(page);
    await expectTheme(page, 'dark');
  });
});
