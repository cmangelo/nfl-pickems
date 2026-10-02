import { expect, test } from '@playwright/test';
import { loginAs, resetDb, seedWeek, setLive, setNow, setResult } from './helpers';

const WED = '2026-10-07T20:00:00Z'; // week locks Thu Oct 8 12:00 PM PT
const SUN = '2026-10-11T21:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('@smoke week picker: tapping the button again closes it, back to the page it was opened from', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/games');

  const picker = page.getByTestId('week-picker');
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await picker.click();
  await expect(page).toHaveURL(/\/weeks\?/);
  await expect(page.getByRole('heading', { name: 'Choose week' })).toBeVisible();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await expect(picker).toHaveAccessibleName('Close week picker');

  await picker.click();
  await expect(page).toHaveURL(new RegExp(`/games\\?week=${weekId}$`));
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Choose week' })).toHaveCount(0);
});

test('@smoke bottom nav floats as a rounded capsule above the page edge and never covers content', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 6, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  const nav = page.getByTestId('bottom-nav');
  const style = await nav.evaluate((el) => {
    const cs = getComputedStyle(el);
    const fixed = getComputedStyle(el.parentElement!).position;
    return { fixed, radius: parseFloat(cs.borderTopLeftRadius), blur: cs.backdropFilter };
  });
  expect(style.fixed).toBe('fixed');
  expect(style.radius).toBeGreaterThanOrEqual(24);
  expect(style.blur).toContain('blur');

  const vp = page.viewportSize()!;
  const box = (await nav.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12); // inset from the sides
  expect(vp.width - (box.x + box.width)).toBeGreaterThanOrEqual(12);
  expect(vp.height - (box.y + box.height)).toBeGreaterThanOrEqual(10); // hovers above the bottom edge

  // Scrolled to the very bottom, the last control sits fully above the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const submit = (await page.getByRole('button', { name: /Pick \d+ more/ }).boundingBox())!;
  const navNow = (await nav.boundingBox())!;
  expect(submit.y + submit.height).toBeLessThanOrEqual(navNow.y);

  // Lucide icons in the bar and the header.
  for (const name of ['My Picks', 'Leaderboard', 'Games', 'Admin']) {
    await expect(nav.getByRole('link', { name }).locator('svg.lucide')).toHaveCount(1);
  }
  await expect(nav.getByRole('link', { name: 'My Picks' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('week-picker').locator('svg.lucide-chevron-down')).toHaveCount(1);
});

test('team logos show next to abbreviations, served locally in tests (never the network)', async ({ page, context, request }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  const btn = page.getByTestId(`pick-${gameIds[0]}-home`);
  await expect(btn).toHaveAccessibleName('KC'); // the logo is decorative; the abbreviation is the name
  const logo = btn.getByTestId('team-logo');
  await expect(logo).toHaveAttribute('data-team', 'KC');
  await expect(logo).toHaveAttribute('src', '/api/test/logo/500-dark/kc.png');
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`).getByTestId('team-logo')).toHaveAttribute('data-team', 'BUF');
  expect(external).toEqual([]);
});

test('games tab: live score, quarter and clock; halftime; final score; live data never scores', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 3, tuesday: WED });
  const [g0, g1, g2] = gameIds; // g0: BUF @ KC, g1: DAL @ PHI
  await setLive(request, g0, { homeScore: 17, awayScore: 10, period: 3, clock: '4:12' });
  await setLive(request, g1, { homeScore: 7, awayScore: 14, period: 2, clock: '0:00', status: 'STATUS_HALFTIME' });
  await setResult(request, g2, 'away', { homeScore: 20, awayScore: 23 });
  await setNow(context, SUN);
  await loginAs(page, 'admin');
  await page.goto('/games');

  await expect(page.getByTestId(`game-status-${g0}`)).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId(`game-status-${g0}`)).toContainText('Q3 · 4:12');
  await expect(page.getByTestId(`score-${g0}-home`)).toHaveText('17');
  await expect(page.getByTestId(`score-${g0}-away`)).toHaveText('10');
  await expect(page.getByTestId(`split-${g0}-home`).getByTestId('team-logo')).toHaveAttribute('data-team', 'KC');

  await expect(page.getByTestId(`game-status-${g1}`)).toContainText('Halftime');
  await expect(page.getByTestId(`score-${g1}-away`)).toHaveText('14');

  await expect(page.getByTestId(`game-status-${g2}`)).toHaveText('Final');
  await expect(page.getByTestId(`game-status-${g2}`)).not.toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId(`score-${g2}-away`)).toHaveText('23');
  await expect(page.getByTestId(`split-${g2}-away`)).toHaveAttribute('data-winner', 'true');
  // Live games are still pending: only the final game counts.
  await expect(page.getByTestId('games-status')).toHaveText('In progress · 1 of 3 games final');
  await expect(page.getByTestId(`split-${g0}-home`)).toHaveAttribute('data-winner', 'false');

  // Once it ends, the final result replaces the live line.
  await setResult(request, g0, 'home', { homeScore: 24, awayScore: 10 });
  await page.reload();
  await expect(page.getByTestId(`game-status-${g0}`)).toHaveText('Final');
  await expect(page.getByTestId(`score-${g0}-home`)).toHaveText('24');

  // Not live and not final: no scores, just the kickoff time.
  await setLive(request, g1, null);
  await page.reload();
  await expect(page.getByTestId(`game-status-${g1}`)).toContainText('PT');
  await expect(page.getByTestId(`score-${g1}-home`)).toHaveCount(0);
});
