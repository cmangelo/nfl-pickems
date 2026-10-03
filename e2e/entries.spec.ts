import { expect, test } from '@playwright/test';
import { TEAM_COLORS, barColors } from '../src/lib/team-colors';
import { createUser, expectNoPlayerCountOf, loginAs, resetDb, seedWeek, setNow, setPaid, setResult, submitPicksFor } from './helpers';

/** Several entries per player per week: each is a separate fee, paid, ranked and shown on its own. */

const WED = '2026-10-07T20:00:00Z'; // week locks Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';
const H = 'home' as const;
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const A = 'away' as const;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('@smoke player adds a second entry from a copy, switches between entries, then removes it', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 3, tuesday: WED });
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await submitPicksFor(request, 'ann', weekId, [H, H, H], 40);
  const bobs = await submitPicksFor(request, 'bob', weekId, [A, A, A], 30);
  await setNow(context, WED);
  await loginAs(page, 'ann');

  await page.goto('/picks');
  await expect(page.getByTestId('entry-tabs')).toHaveCount(0); // one entry: the page looks as before
  await expect(page.getByTestId('add-entry')).toContainText('separate entry fee');

  // Copy entry 1 as the starting point.
  await page.getByTestId('add-entry-copy').click();
  await expect(page).toHaveURL(new RegExp(`entry=new&copy=\\d+`));
  await expect(page.getByTestId('new-entry-notice')).toContainText("starting from Entry 1's picks");
  await expect(page.getByTestId('entry-tab-new')).toHaveAttribute('aria-current', 'page');
  for (const id of gameIds) await expect(page.getByTestId(`pick-${id}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('40');
  await expect(page.getByTestId('add-entry')).toHaveCount(0);

  await page.getByTestId(`pick-${gameIds[0]}-away`).click();
  await page.getByLabel(/Total points in/).fill('41');
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page).toHaveURL(/entry=\d+/);
  await expect(page).not.toHaveURL(/entry=new/);
  await expect(page.getByRole('status')).toHaveText('Entry 2 saved. You can change it until Thu 12:00 PM PT.');
  await expect(page.getByTestId('entry-tab-2')).toHaveAttribute('aria-current', 'page');
  await expect(page).not.toHaveURL(/saved=1/); // a reload won't repeat the notice
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'true');

  // Entry 1 is untouched.
  await page.getByTestId('entry-tab-1').click();
  await expect(page.getByTestId('entry-tab-1')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('40');

  // Edit entry 2 in place.
  await page.getByTestId('entry-tab-2').click();
  await page.getByTestId(`pick-${gameIds[2]}-away`).click();
  await page.getByRole('button', { name: 'Update picks' }).click();
  await expect(page.getByRole('status')).toContainText('Entry 2 saved.');
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[2]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('41');

  // Someone else's entry id in the URL just shows your own first entry.
  await page.goto(`/picks?week=${weekId}&entry=${bobs.entryId}`);
  await expect(page.getByTestId('entry-tab-1')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');

  // Remove entry 2 (two steps), back to a single entry.
  await page.getByTestId('entry-tab-2').click();
  await page.getByTestId('remove-entry').click();
  await page.getByTestId('remove-entry-confirm').click();
  await expect(page).toHaveURL(new RegExp(`/picks\\?week=${weekId}$`));
  await expect(page.getByTestId('entry-tabs')).toHaveCount(0);
  await expect(page.getByTestId('remove-entry')).toHaveCount(0);
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');

  // A blank new entry starts empty; Cancel goes back.
  await page.getByTestId('add-entry-blank').click();
  await expect(page.getByTestId('progress')).toHaveText('0/3 picked');
  await expect(page.getByTestId('new-entry-notice')).toContainText('New entry.');
  await page.getByTestId('new-entry-cancel').click();
  await expect(page.getByTestId('progress')).toHaveText('3/3 picked');

  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHScroll).toBe(false);
});

test('removing Entry 1 shows the next entry\'s own picks and never touches another entry', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'ann');
  await submitPicksFor(request, 'ann', weekId, [H, H], 40);
  await submitPicksFor(request, 'ann', weekId, [A, A], 30, 'new');
  await submitPicksFor(request, 'ann', weekId, [H, A], 20, 'new');
  await setNow(context, WED);
  await loginAs(page, 'ann');

  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('entry-tab-1')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('remove-entry').click();
  await expect(page.getByTestId('remove-entry-confirm')).toHaveText('Yes, remove Entry 1');
  await page.getByTestId('remove-entry-confirm').click();

  // The old Entry 2 (A, A / 30) is now Entry 1, with its own picks, and the confirm is not still armed.
  await expect(page.getByTestId('entry-tab-3')).toHaveCount(0);
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('30');
  await expect(page.getByTestId('remove-entry-confirm')).toHaveCount(0);
  await expect(page.getByTestId('remove-entry')).toHaveText('Remove Entry 1');

  // Saving it changes only that entry.
  await page.getByRole('button', { name: 'Update picks' }).click();
  await expect(page.getByRole('status')).toContainText('Entry 1 saved.');
  await page.getByTestId('entry-tab-2').click();
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('20');
  await page.getByTestId('entry-tab-1').click();
  await expect(page.getByLabel(/Total points in/)).toHaveValue('30');
});

test('a paid entry cannot be removed by the player; the admin is warned before removing it', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'ann');
  await submitPicksFor(request, 'ann', weekId, [H, H], 40);
  await submitPicksFor(request, 'ann', weekId, [A, A], 30, 'new');
  await setPaid(request, 'ann', weekId, true, 1);
  await setNow(context, WED);
  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('remove-entry')).toHaveCount(0);
  await expect(page.getByTestId('paid-entry-note')).toHaveText('Entry 1 is marked paid. Ask an admin if you need it removed.');
  await page.getByTestId('entry-tab-2').click();
  await expect(page.getByTestId('remove-entry')).toBeVisible(); // unpaid: removable

  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Ann (1)' }).click();
  await page.getByTestId('remove-entry').click();
  await expect(page.getByTestId('remove-entry-warning')).toContainText('marked paid');
  await page.getByTestId('entry-tab-2').click();
  await page.getByTestId('remove-entry').click();
  await expect(page.getByTestId('remove-entry-warning')).toHaveCount(0);
});

test('open week: "N in" counts entries and marks a player with several', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await submitPicksFor(request, 'ann', weekId, [H, H], 40);
  await submitPicksFor(request, 'ann', weekId, [A, A], 41, 'new');
  await submitPicksFor(request, 'bob', weekId, [H, A], 30);
  await setNow(context, WED);
  await loginAs(page, 'bob');
  await page.goto('/leaderboard');
  await expect(page.getByTestId('in-count')).toHaveText('3 in');
  const list = page.getByTestId('in-list');
  await expect(list.getByText('Ann ×2')).toBeVisible();
  await expect(list.getByText('Bob (you)')).toBeVisible();
  await expectNoPlayerCountOf(page);
});

test('payments: a player with several entries gets one switch per entry', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await submitPicksFor(request, 'ann', weekId, [H, H], 40);
  await submitPicksFor(request, 'ann', weekId, [A, A], 41, 'new');
  await submitPicksFor(request, 'bob', weekId, [H, A], 30);
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${weekId}`);

  const summary = page.getByTestId('paid-summary');
  await expect(summary).toHaveText('0 paid · 3 unpaid');
  await expect(page.getByTestId('entry-count-ann')).toHaveText('2 entries');
  await expect(page.getByTestId('entry-ann').getByRole('switch')).toHaveCount(2);
  await expect(page.getByTestId('entry-bob').getByRole('switch')).toHaveCount(1);

  await page.getByRole('switch', { name: 'Ann (2) paid' }).click();
  await expect(summary).toHaveText('1 paid · 2 unpaid');
  await expect(page.getByRole('switch', { name: 'Ann (2) paid' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Ann (1) paid' })).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(summary).toHaveText('1 paid · 2 unpaid');
  await expect(page.getByRole('switch', { name: 'Ann (2) paid' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Ann (1) paid' })).toHaveAttribute('aria-checked', 'false');

  // "Edit picks" opens that entry; another player's picks stay hidden while the week is open.
  await page.getByRole('link', { name: 'Edit picks for Ann (2)' }).click();
  await expect(page.getByTestId('entry-tab-2')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('picks-hidden-notice')).toBeVisible();
  await expect(page.getByTestId('add-entry-copy')).toHaveCount(0);
});

test('admin adds an entry for a player after the lock, then deletes it', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Bob', 'bob');
  await submitPicksFor(request, 'bob', weekId, [H, H], 30);
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Bob' }).click();
  await expect(page.getByTestId('entry-tabs')).toHaveCount(0);

  await page.getByTestId('add-entry-copy').click();
  await expect(page.getByTestId('new-entry-notice')).toContainText("New entry for Bob, starting from Entry 1's picks. It starts unpaid.");
  await page.getByTestId(`pick-${gameIds[1]}-away`).click();
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('status')).toHaveText('Entry 2 saved for Bob.');
  await expect(page.getByTestId('entry-tab-2')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');

  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 2 unpaid');
  await expect(page.getByTestId('entry-count-bob')).toHaveText('2 entries');

  await page.getByRole('link', { name: 'Edit picks for Bob (2)' }).click();
  await page.getByTestId('remove-entry').click();
  await page.getByTestId('remove-entry-confirm').click();
  await expect(page.getByTestId('entry-tabs')).toHaveCount(0);
  await expect(page.getByTestId(`pick-${gameIds[1]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 1 unpaid');
});

test('@smoke locked week: each entry is ranked, shown, split and listed on its own', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED, results: ['home', 'home', null, null] });
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await submitPicksFor(request, 'ann', weekId, [H, H, H, H], 40); // 2 correct
  await submitPicksFor(request, 'ann', weekId, [A, A, H, H], 41, 'new'); // 0 correct
  await submitPicksFor(request, 'ann', weekId, [A, H, A, A], 42, 'new'); // 1 correct, stays unpaid
  await submitPicksFor(request, 'bob', weekId, [H, A, A, A], 30); // 1 correct
  await setPaid(request, 'ann', weekId, true, 1);
  await setPaid(request, 'ann', weekId, true, 2);
  await setPaid(request, 'bob', weekId, true);
  await setNow(context, FRI);
  await loginAs(page, 'ann');

  await page.goto(`/leaderboard?week=${weekId}`);
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.getByTestId('player-name')).toHaveText(['Ann (1)', 'Bob', 'Ann (2)']);
  await expect(rows.getByTestId('correct-count')).toHaveText(['2', '1', '0']);
  await expect(rows.getByText('YOU', { exact: true })).toHaveCount(2);
  await expect(page.getByTestId('not-counted')).toContainText('Ann (3)');
  await expectNoPlayerCountOf(page);

  // Drill into entry 2.
  await rows.nth(2).click();
  await expect(page.getByTestId('player-heading')).toContainText('Your picks');
  await expect(page.getByTestId('player-heading')).toContainText('Entry 2');
  await expect(page.getByTestId('entry-tab-2')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId(`team-${gameIds[0]}-away`)).toHaveAttribute('data-picked', 'true');
  await page.getByTestId('entry-tab-3').click();
  await expect(page.getByTestId('player-unpaid')).toBeVisible();
  await expectNoPlayerCountOf(page);

  // My Picks (locked): tabs per entry.
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('entry-tab-1')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('chip-correct')).toContainText('2');
  await page.getByTestId('entry-tab-2').click();
  await expect(page.getByTestId('chip-correct')).toContainText('0');
  await expect(page.getByTestId('add-entry')).toHaveCount(0); // no new entries once locked

  // Games: splits count paid entries; "Your pick ×N" shows how many of my entries took each side.
  await page.goto(`/games?week=${weekId}`);
  await expect(page.getByTestId('counted-players')).toHaveText('3 counted entries');
  await expect(page.getByTestId(`split-${gameIds[0]}-home`)).toContainText('2 entries');
  await expect(page.getByTestId(`split-${gameIds[0]}-away`)).toContainText('1 entry');
  await expect(page.getByTestId(`your-pick-${gameIds[0]}-away`)).toHaveText('Your pick ×2 (entries)');
  await expect(page.getByTestId(`your-pick-${gameIds[0]}-home`)).toHaveText('Your pick ×1 (entries)');
  await expect(page.getByTestId(`split-${gameIds[2]}-home`)).toHaveAttribute('data-yours-count', '2');
  await expect(page.getByTestId(`split-${gameIds[2]}-away`)).toHaveAttribute('data-yours-count', '1');
  await expectNoPlayerCountOf(page);

  // Week history lists each entry.
  await page.goto('/weeks');
  await expect(page.getByTestId('week-row-7')).toContainText('You: 2 (1st) · 0 (3rd) · 1 so far');

  // Once final, the winner banner names the entry.
  for (const id of gameIds.slice(2)) await setResult(request, id, 'home');
  await page.goto(`/leaderboard?week=${weekId}`);
  await expect(page.locator('[data-testid^="rank-row-"]').getByTestId('player-name')).toHaveText(['Ann (1)', 'Ann (2)', 'Bob']);
  // Upset of the week counts entries: game 2 was missed by Ann (2) and Bob.
  await expect(page.getByTestId('upset-wrong')).toHaveText('2 entries got it wrong');
  await expect(page.getByTestId('upset-right')).toHaveText('Only 1 entry picked it (Ann (1))');
  await page.goto('/weeks');
  await expect(page.getByTestId('week-row-7')).toContainText('You won');
  await expect(page.getByTestId('week-row-7')).toContainText('Winner: Ann (1)');
});

test('@smoke games: splits count every paid entry, with a two-color bar and percentages', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  const [g0, g1] = gameIds;
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  // Ann has three paid entries on g0's home side; Bob one on the away side. Everyone picks g1 home.
  await submitPicksFor(request, 'ann', weekId, [H, H], 40);
  await submitPicksFor(request, 'ann', weekId, [H, H], 41, 'new');
  await submitPicksFor(request, 'ann', weekId, [H, H], 42, 'new');
  await submitPicksFor(request, 'bob', weekId, [A, H], 30);
  await setPaid(request, 'ann', weekId, true);
  await setPaid(request, 'bob', weekId, true);
  await setNow(context, FRI);
  await loginAs(page, 'bob');
  await page.goto(`/games?week=${weekId}`);

  await expect(page.getByTestId('counted-players')).toHaveText('4 counted entries');
  await expect(page.getByTestId(`split-${g0}-home`)).toContainText('3 entries');
  await expect(page.getByTestId(`split-${g0}-away`)).toContainText('1 entry');
  await expect(page.getByTestId(`split-pct-${g0}-away`)).toHaveText(/ 25%$/);
  await expect(page.getByTestId(`split-pct-${g0}-home`)).toHaveText(/ 75%$/);
  await expect(page.getByTestId(`split-bar-${g0}`)).toHaveAttribute('aria-label', /^1 entry picked \w+ \(25%\), 3 entries picked \w+ \(75%\)$/);

  // Each segment in its team's color (barColors), sized by share.
  const away = page.getByTestId(`split-seg-${g0}-away`);
  const home = page.getByTestId(`split-seg-${g0}-home`);
  const [awayTeam, homeTeam] = (await page.getByTestId(`game-card-${g0}`).getByText(/^\w+ @ \w+$/).innerText()).split(' @ ');
  const want = barColors(awayTeam, homeTeam);
  expect(TEAM_COLORS[awayTeam], 'seeded teams are real teams').toBeDefined();
  await expect(away).toHaveAttribute('data-color', want.away);
  await expect(home).toHaveAttribute('data-color', want.home);
  const color = (l: typeof away) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await color(away)).toBe(rgb(want.away));
  expect(await color(home)).toBe(rgb(want.home));
  expect(want.away).not.toBe(want.home);
  const wAway = (await away.boundingBox())!.width;
  const wHome = (await home.boundingBox())!.width;
  expect(wHome / wAway).toBeGreaterThan(2.7);
  expect(wHome / wAway).toBeLessThan(3.3);

  // One-sided game: a single full segment, 0% / 100%.
  await expect(page.getByTestId(`split-seg-${g1}-away`)).toHaveCount(0);
  await expect(page.getByTestId(`split-pct-${g1}-away`)).toHaveText(/ 0%$/);
  await expect(page.getByTestId(`split-pct-${g1}-home`)).toHaveText(/ 100%$/);
  await expectNoPlayerCountOf(page);
});
