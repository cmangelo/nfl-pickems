import { expect, test, type Page } from '@playwright/test';
import { createUser, expectNoPlayerCountOf, loginAs, resetDb, seedWeek, setEntryFee, setNow, setPaid, submitPicksFor } from './helpers';

const FRI = '2026-10-09T20:00:00Z';
const H = 'home' as const;
const A = 'away' as const;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

/**
 * Week 7 (final, $10 fee): results H,H,A,A, Monday tiebreaker total 44.
 *   annie 4/4 (tb 44, ±0) wins; cyrus 2/4 (tb 40, ±4) 2nd; bobby 2/4 (tb 50, ±6) 3rd; diana unpaid.
 * Week 8 (the current week, locked, 2 of 4 final): must not count.
 */
async function seedSeason(request: Parameters<typeof resetDb>[0]) {
  const w7 = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: '2026-09-30T20:00:00Z', results: [H, H, A, A] });
  const w8 = await seedWeek(request, { weekNumber: 8, numGames: 4, tuesday: FRI, results: [H, A, null, null] });
  for (const [n, u] of [['Ann', 'annie'], ['Bob', 'bobby'], ['Cy', 'cyrus'], ['Di', 'diana']]) await createUser(request, n, u);
  await submitPicksFor(request, 'annie', w7.weekId, [H, H, A, A], 44);
  await submitPicksFor(request, 'bobby', w7.weekId, [H, H, H, H], 50);
  await submitPicksFor(request, 'cyrus', w7.weekId, [A, A, A, A], 40);
  await submitPicksFor(request, 'diana', w7.weekId, [H, H, A, A], 44);
  await submitPicksFor(request, 'annie', w8.weekId, [A, H, H, H], 30);
  await submitPicksFor(request, 'bobby', w8.weekId, [H, A, H, H], 30);
  for (const u of ['annie', 'bobby', 'cyrus']) await setPaid(request, u, w7.weekId, true);
  for (const u of ['annie', 'bobby']) await setPaid(request, u, w8.weekId, true);
  await setEntryFee(request, w7.weekId, 1000);
  return { w7, w8 };
}

const names = (page: Page) => page.getByTestId('season-table').getByTestId('season-name');

test('@smoke season stats: tab from the leaderboard, table, sorting', async ({ page, context, request }) => {
  const { w8 } = await seedSeason(request);
  await setNow(context, FRI);
  await loginAs(page, 'cyrus');
  await page.goto('/leaderboard');

  await expect(page.getByTestId('lb-tab-week')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('lb-tab-season').click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard/season\\?week=${w8.weekId}$`));
  await expect(page.getByTestId('lb-tab-season')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('bottom-nav').getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('aria-current', 'page');
  // Not tied to one week: the header shows a title instead of the week picker.
  await expect(page.getByTestId('page-title')).toHaveText('Leaderboard');
  await expect(page.getByTestId('week-picker')).toHaveCount(0);

  await expect(page.getByTestId('season-title')).toHaveText('2026 Season');
  await expect(page.getByTestId('season-through')).toHaveText('Completed weeks, paid entries');

  // Just the table: no leader cards, no Net or Streak column.
  await expect(page.getByRole('region', { name: 'Season leaders' })).toHaveCount(0);
  await expect(page.locator('[data-testid^="leader-"]')).toHaveCount(0);
  await expect(page.getByTestId('sort-net')).toHaveCount(0);
  await expect(page.getByTestId('sort-streak')).toHaveCount(0);

  // Paid entries of final weeks only: diana (unpaid) is left out; week 8 (in progress) adds nothing.
  await expect(names(page)).toHaveText(['annie', 'bobby', 'cyrus']);
  const row = (u: string) => page.getByTestId('season-table').locator('tbody tr', { hasText: u });
  await expect(row('annie').getByTestId('cell-pct')).toHaveText('100.0%');
  await expect(row('annie').getByTestId('cell-wins')).toHaveText('1');
  await expect(row('annie').getByTestId('cell-correct')).toHaveText('4-0');
  await expect(row('annie').getByTestId('cell-best')).toHaveText('100%');
  await expect(row('annie').getByTestId('cell-weeks')).toHaveText('1');
  await expect(row('annie').getByTestId('cell-entries')).toHaveText('1');
  await expect(row('bobby').getByTestId('cell-pct')).toHaveText('50.0%');
  await expect(row('bobby').getByTestId('cell-tb')).toHaveText('±6.0');
  await expect(row('cyrus').getByTestId('cell-top3')).toHaveText('1');
  await expect(row('cyrus')).toContainText('YOU');
  await expect(page.getByTestId('season-table')).not.toContainText('diana');

  // Sort by tiebreaker distance (closest first), then flip it.
  await page.getByTestId('sort-tb').click();
  await expect(names(page)).toHaveText(['annie', 'cyrus', 'bobby']);
  await expect(page.getByRole('columnheader', { name: 'Sort by Average tiebreaker distance' })).toHaveAttribute('aria-sort', 'ascending');
  await page.getByTestId('sort-tb').click();
  await expect(names(page)).toHaveText(['bobby', 'cyrus', 'annie']);
  await expect(page.getByRole('columnheader', { name: 'Sort by Average tiebreaker distance' })).toHaveAttribute('aria-sort', 'descending');
  await page.getByTestId('sort-pct').click();
  await expect(names(page)).toHaveText(['annie', 'bobby', 'cyrus']);
  // No week numbers in the season stats.
  await expect(page.getByTestId('season-table')).not.toContainText(/\bW(k|eek)? ?\d/);

  await expectNoPlayerCountOf(page);

  // Back to the week view, keeping the selected week.
  await page.getByTestId('lb-tab-week').click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard\\?week=${w8.weekId}$`));
  await expect(page.getByTestId('week-picker')).toHaveText(/Week 8/);
});

test('@smoke player season: week by week, each entry links to its picks', async ({ page, context, request }) => {
  const { w7 } = await seedSeason(request);
  // A second entry for bobby: 3/4, tiebreaker 47 (±3) => 2nd; his first entry drops to 4th. Pot $40 to annie.
  const { entryId } = await submitPicksFor(request, 'bobby', w7.weekId, [H, H, A, H], 47, 'new');
  await setPaid(request, 'bobby', w7.weekId, true);
  await setNow(context, FRI);
  await loginAs(page, 'annie');
  await page.goto('/leaderboard/season');

  const bobbyRow = page.getByTestId('season-table').locator('tbody tr', { hasText: 'bobby' });
  await expect(bobbyRow.getByTestId('cell-entries')).toHaveText('2');
  await expect(bobbyRow.getByTestId('cell-weeks')).toHaveText('1');
  await page.getByTestId('sort-entries').click();
  await expect(names(page).first()).toHaveText('bobby');
  await page.getByTestId('season-table').getByRole('link', { name: 'bobby: season by week' }).click();
  await expect(page).toHaveURL(/\/leaderboard\/season\/player\/\d+\?week=\d+$/);
  await expect(page.getByTestId('page-title')).toHaveText('Leaderboard');
  await expect(page.getByTestId('player-season-heading')).toHaveText('bobby');
  await expect(page.getByTestId('tile-pct')).toContainText('62.5%');
  await expect(page.getByTestId('tile-wins')).toContainText('0');
  await expect(page.getByTestId('tile-net')).toContainText('−$20');
  await expect(page.getByTestId('tile-picks')).toContainText('5-3');
  await expect(page.getByTestId('tile-best')).toHaveText(/Best week\s*75%$/);
  await expect(page.getByTestId('tile-tb')).toContainText('±4.5');
  await expect(page.getByTestId('tile-streak')).toContainText('2');
  await expect(page.getByTestId('tile-top3')).toContainText('1');

  const rows = page.getByTestId('player-week-7');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Entry 1');
  await expect(rows.nth(0).getByTestId('week-finish')).toHaveText('4th');
  await expect(rows.nth(0).getByTestId('week-score')).toHaveText('2-2 · 50%');
  await expect(rows.nth(0)).toContainText('TB ±6');
  await expect(rows.nth(1)).toContainText('Entry 2');
  await expect(rows.nth(1).getByTestId('week-finish')).toHaveText('2nd');
  await expect(rows.nth(1).getByTestId('week-score')).toHaveText('3-1 · 75%');
  await expect(page.getByTestId('week-payout')).toHaveCount(0);
  await expectNoPlayerCountOf(page);

  await rows.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard/player/\\d+\\?week=${w7.weekId}&entry=${entryId}$`));
  await expect(page.getByTestId('player-heading')).toContainText("bobby's picks");

  // The viewer's own season, with the week's payout.
  await page.goto('/leaderboard/season');
  await page.getByTestId('season-table').getByRole('link', { name: 'annie: season by week' }).click();
  await expect(page.getByTestId('player-season-heading')).toHaveText('Your season');
  await expect(page.getByTestId('player-week-7').getByTestId('week-finish')).toHaveText('1st');
  await expect(page.getByTestId('week-payout')).toHaveText('+$40');
  await page.getByTestId('back-to-season').click();
  await expect(page).toHaveURL(/\/leaderboard\/season\?week=\d+$/);
});

test('player season: nothing counted yet, unknown player is a 404', async ({ page, context, request }) => {
  await seedSeason(request);
  await setNow(context, FRI);
  await loginAs(page, 'diana'); // only ever unpaid
  await page.goto('/leaderboard/season');
  await expect(page.getByTestId('season-table')).not.toContainText('diana');
  const { userId } = await (await request.post('/api/test/login', { data: { username: 'diana' } })).json();
  await page.goto(`/leaderboard/season/player/${userId}`);
  await expect(page.getByTestId('player-season-heading')).toHaveText('Your season');
  await expect(page.getByTestId('player-season-empty')).toHaveText('No completed weeks with a paid entry yet.');
  expect((await page.goto('/leaderboard/season/player/99999'))?.status()).toBe(404);
  expect((await page.goto('/leaderboard/season/player/abc'))?.status()).toBe(404);
});

test('season table scrolls inside its card, never the page, on a phone', async ({ page, context, request }) => {
  await seedSeason(request);
  await setNow(context, FRI);
  await loginAs(page, 'annie');
  await page.goto('/leaderboard/season');
  await expect(names(page)).toHaveCount(3);
  const page_ = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(page_.sw).toBeLessThanOrEqual(page_.cw);
  const wrap = page.getByTestId('season-table-wrap');
  const box = await wrap.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(box.sw).toBeGreaterThan(box.cw);
  // The player column stays put while the stats scroll under it.
  const nameCell = page.getByTestId('season-table').locator('tbody th').first();
  const before = await nameCell.boundingBox();
  await wrap.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  const after = await nameCell.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 0);
});

test('picking a week of another season shows that season', async ({ page, context, request }) => {
  const w = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: '2026-09-30T20:00:00Z', results: [H, A] });
  const old = await seedWeek(request, { season: 2025, weekNumber: 18, numGames: 2, tuesday: '2026-01-01T20:00:00Z', results: [H, H] });
  await createUser(request, 'Ann', 'annie');
  await submitPicksFor(request, 'annie', w.weekId, [H, H], 44);
  await submitPicksFor(request, 'annie', old.weekId, [H, H], 44);
  await setPaid(request, 'annie', w.weekId, true);
  await setPaid(request, 'annie', old.weekId, true);
  await setNow(context, FRI);
  await loginAs(page, 'annie');

  await page.goto('/leaderboard/season');
  await expect(page.getByTestId('season-title')).toHaveText('2026 Season');
  await expect(page.getByTestId('cell-pct')).toHaveText('50.0%');

  await page.getByRole('navigation', { name: 'Season' }).getByRole('link', { name: '2025' }).click();
  await expect(page).toHaveURL(new RegExp(`week=${old.weekId}$`));
  await expect(page.getByTestId('season-title')).toHaveText('2025 Season');
  await expect(page.getByTestId('season-through')).toHaveText('Completed weeks, paid entries');
  await expect(page.getByTestId('cell-pct')).toHaveText('100.0%');
});

test('empty season: no completed week yet', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: FRI });
  await createUser(request, 'Ann', 'annie');
  await submitPicksFor(request, 'annie', weekId, [H, H], 44);
  await setNow(context, '2026-10-07T20:00:00Z');
  await loginAs(page, 'annie');
  await page.goto('/leaderboard/season');
  await expect(page.getByTestId('season-through')).toHaveText('No completed weeks yet');
  await expect(page.getByTestId('season-empty')).toHaveText('Season stats show up here once a week is final.');
  await expect(page.getByTestId('season-table')).toHaveCount(0);
});
