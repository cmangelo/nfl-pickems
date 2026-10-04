import { expect, test, type Page } from '@playwright/test';
import { loginAs, resetDb, seedWeek, setNow } from './helpers';

const WED = '2026-10-07T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

const accentVar = (page: Page, name = '--accent') =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function openTuner(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Theme tuner' }).click();
  await expect(page.getByTestId('theme-tuner')).toBeVisible();
}

test('@smoke theme tuner: try a preset live, keep it across reloads, copy the CSS, reset', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  expect(await accentVar(page)).toBe('#fbbf24');

  await openTuner(page);
  await expect(page.getByTestId('contrast')).toHaveCount(3);
  await page.getByTestId('preset-sky').click();
  expect(await accentVar(page)).toBe('#38bdf8');
  await expect(page.getByTestId('preset-sky')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tuner-css')).toContainText('--accent: #38bdf8;');

  // Applies before paint on the next page load (and on other pages).
  await page.goto('/leaderboard');
  expect(await accentVar(page)).toBe('#38bdf8');

  await openTuner(page);
  await page.getByTestId('tuner-copy').click();
  await expect(page.getByTestId('tuner-copy')).toHaveText('Copied CSS');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('--accent: #38bdf8;');

  await page.getByTestId('tuner-reset').click();
  expect(await accentVar(page)).toBe('#fbbf24');
  await page.reload();
  expect(await accentVar(page)).toBe('#fbbf24');
});

test('theme tuner: a typed hex, and manual text colors', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await openTuner(page);

  await page.getByLabel('Accent', { exact: true }).fill('#1d4ed8');
  expect(await accentVar(page)).toBe('#1d4ed8');
  expect(await accentVar(page, '--on-accent')).toBe('#ffffff'); // derived: white reads better on dark blue

  await page.getByLabel('Derive text colors automatically').uncheck();
  await page.getByLabel('Text on accent', { exact: true }).fill('#000000');
  expect(await accentVar(page, '--on-accent')).toBe('#000000');
  expect(await accentVar(page)).toBe('#1d4ed8');

  await page.getByRole('button', { name: 'Close theme tuner' }).click();
  await expect(page.getByTestId('theme-tuner')).toHaveCount(0);
});
