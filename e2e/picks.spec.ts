import { expect, test } from '@playwright/test';
import { createUser, loginAs, resetDb, seedWeek, setLive, setNow, setPaid, setResult, submitPicksFor } from './helpers';

const WED = '2026-10-07T20:00:00Z'; // Wednesday of the week locking Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('@smoke open week: pick every game, submit, reload prefilled, edit and resubmit', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  await expect(page.getByTestId('week-picker')).toContainText('Week 7');
  await expect(page.getByTestId('status-pill')).toHaveText('Open');
  await expect(page.getByTestId('lock-info')).toHaveText('Locks Thu, Oct 8 · 12:00 PM PT');
  await expect(page.getByTestId('countdown')).toContainText('23 hrs');
  await expect(page.getByTestId('progress')).toHaveText('0/4 picked');
  for (const day of ['Thursday', 'Sunday', 'Monday']) await expect(page.getByRole('heading', { name: day })).toBeVisible();
  await expect(page.getByLabel(/Total points in .+ @ .+ \(Mon /)).toBeVisible();

  const submit = page.getByRole('button', { name: /pick|enter|submit|update/i, exact: false }).last();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText('Pick 4 more');

  for (const id of gameIds) await page.getByTestId(`pick-${id}-home`).click();
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('progress')).toHaveText('4/4 picked');
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText('Enter tiebreaker');

  await page.getByLabel(/Total points in/).fill('45');
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText('Submit picks');
  await submit.click();
  await expect(page.getByRole('status')).toHaveText('Picks saved. You can change them until Thu 12:00 PM PT.');
  await expect(page).not.toHaveURL(/saved=1/);

  await page.reload();
  await expect(page.getByRole('status')).toHaveCount(0);
  for (const id of gameIds) await expect(page.getByTestId(`pick-${id}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('45');
  await expect(page.getByTestId('progress')).toHaveText('4/4 picked');

  // Edit and resubmit.
  await page.getByTestId(`pick-${gameIds[1]}-away`).click();
  await page.getByLabel(/Total points in/).fill('51');
  await page.getByRole('button', { name: 'Update picks' }).click();
  await expect(page.getByRole('status')).toContainText('Picks saved.');
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('51');
  expect(weekId).toBeGreaterThan(0);
});

test('open week: a pick made after lock is rejected with the server error', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, '2026-10-08T18:59:00Z'); // 1 minute before lock
  await loginAs(page, 'admin');
  await page.goto('/picks');
  for (const id of gameIds) await page.getByTestId(`pick-${id}-away`).click();
  await page.getByLabel(/Total points in/).fill('40');
  await setNow(context, FRI); // lock passes while the form is open
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.locator('form [role=alert]')).toHaveText('Picks are closed for this week.');
});

test('locked week: read-only, results marked right / wrong / tie / pending, header pill Live then Final', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED });
  await submitPicksFor(request, 'admin', weekId, ['home', 'home', 'home', 'home'], 45);
  await setResult(request, gameIds[0], 'home');
  await setResult(request, gameIds[1], 'away');
  await setResult(request, gameIds[2], 'tie');
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  await expect(page.getByTestId('status-pill')).toHaveText('Live');
  await expect(page.getByTestId('status-pill')).toHaveAttribute('data-state', 'live');
  await expect(page.getByRole('button', { name: /submit|update/i })).toHaveCount(0);
  await expect(page.getByTestId('chip-correct')).toContainText('1');
  await expect(page.getByTestId('chip-wrong')).toContainText('2');
  await expect(page.getByTestId('chip-pending')).toContainText('1');
  // Correct > 0 is green, wrong > 0 is red, to-play stays the default text color.
  await expect(page.getByTestId('chip-correct-count')).toHaveCSS('color', 'rgb(34, 197, 94)');
  await expect(page.getByTestId('chip-wrong-count')).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(page.getByTestId('chip-pending-count')).not.toHaveClass(/text-(correct|wrong)/);
  await expect(page.getByTestId('score-heading')).toHaveText('Scorecard');
  await expect(page.getByTestId('picks-heading')).toHaveText('Your picks');
  await expect(page.getByTestId(`game-${gameIds[0]}`)).toHaveAttribute('data-result', 'right');
  await expect(page.getByTestId(`game-${gameIds[1]}`)).toHaveAttribute('data-result', 'wrong');
  await expect(page.getByTestId(`game-${gameIds[2]}`)).toHaveAttribute('data-result', 'wrong');
  await expect(page.getByTestId(`game-${gameIds[2]}`)).toContainText('Tie');
  await expect(page.getByTestId(`game-${gameIds[3]}`)).toHaveAttribute('data-result', 'pending');
  await expect(page.getByTestId(`game-${gameIds[0]}`).getByLabel('Correct').first()).toBeVisible();
  await expect(page.getByTestId(`game-${gameIds[1]}`).getByLabel('Wrong').first()).toBeVisible();
  await expect(page.getByTestId('tiebreaker-guess')).toContainText('45');

  await setResult(request, gameIds[3], 'home');
  await page.reload();
  await expect(page.getByTestId('status-pill')).toHaveText('Final');
  await expect(page.getByTestId('status-pill')).toHaveAttribute('data-state', 'final');
  await expect(page.getByTestId('chip-pending')).toContainText('0');
  await expect(page.getByTestId(`game-${gameIds[3]}`)).toHaveAttribute('data-result', 'right');
});

test('@smoke locked week: live score, clock and winning / losing / tied on my picks; live never scores', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED });
  const [g0, g1, g2, g3] = gameIds;
  await submitPicksFor(request, 'admin', weekId, ['home', 'home', 'away', 'home'], 45);
  await setLive(request, g0, { homeScore: 17, awayScore: 10, period: 3, clock: '4:12' }); // my home pick leads
  await setLive(request, g1, { homeScore: 7, awayScore: 14, period: 2, clock: '0:00', status: 'STATUS_HALFTIME' }); // trails
  await setLive(request, g2, { homeScore: 3, awayScore: 3, period: 1, clock: '9:30' }); // tied
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  const g0Card = page.getByTestId(`game-${g0}`);
  await expect(g0Card).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId(`game-status-${g0}`)).toHaveAttribute('data-live', 'true');
  await expect(page.getByTestId(`game-status-${g0}`)).toContainText('Q3 · 4:12');
  await expect(page.getByTestId(`score-${g0}-home`)).toHaveText('17');
  await expect(page.getByTestId(`score-${g0}-away`)).toHaveText('10');
  await expect(page.getByTestId(`game-mark-${g0}`)).toHaveText('Winning');

  await expect(page.getByTestId(`game-status-${g1}`)).toContainText('Halftime');
  await expect(page.getByTestId(`score-${g1}-away`)).toHaveText('14');
  await expect(page.getByTestId(`game-mark-${g1}`)).toHaveText('Losing');

  await expect(page.getByTestId(`game-status-${g2}`)).toContainText('Q1 · 9:30');
  await expect(page.getByTestId(`game-mark-${g2}`)).toHaveText('Tied');

  // Not started: kickoff time, no score, still "Pending".
  await expect(page.getByTestId(`game-${g3}`)).toHaveAttribute('data-live', 'false');
  await expect(page.getByTestId(`game-status-${g3}`)).toContainText('PT');
  await expect(page.getByTestId(`score-${g3}-home`)).toHaveCount(0);
  await expect(page.getByTestId(`game-mark-${g3}`)).toHaveText('Pending');

  // Live games never score: everything is still to play.
  for (const id of gameIds) await expect(page.getByTestId(`game-${id}`)).toHaveAttribute('data-result', 'pending');
  await expect(page.getByTestId('chip-correct-count')).toHaveText('0');
  await expect(page.getByTestId('chip-pending-count')).toHaveText('4');

  // Once it ends, the final result replaces the live line.
  await setResult(request, g0, 'home', { homeScore: 24, awayScore: 10 });
  await page.reload();
  await expect(g0Card).toHaveAttribute('data-live', 'false');
  await expect(g0Card).toHaveAttribute('data-result', 'right');
  await expect(page.getByTestId(`game-status-${g0}`)).toHaveText('Final');
  await expect(page.getByTestId(`score-${g0}-home`)).toHaveText('24');
  await expect(page.getByTestId(`game-mark-${g0}`)).toHaveText('Correct');
  await expect(page.getByTestId('chip-correct-count')).toHaveText('1');
});

test('locked week: a user who did not enter sees the notice', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 3, tuesday: WED });
  await createUser(request, 'Bob', 'bob');
  await setNow(context, FRI);
  await loginAs(page, 'bob');
  await page.goto('/picks');
  await expect(page.getByTestId('no-entry')).toHaveText("You didn't enter picks for Week 7.");
  await expect(page.getByRole('button', { name: /submit|update/i })).toHaveCount(0);
});

test('future weeks are hidden: not in /weeks and ?week= falls back to current', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  const future = await seedWeek(request, { weekNumber: 8, numGames: 2, tuesday: '2026-10-14T20:00:00Z' });
  await setNow(context, WED);
  await loginAs(page, 'admin');

  await page.goto('/weeks');
  await expect(page.getByTestId('week-row-7')).toBeVisible();
  await expect(page.getByTestId('week-row-8')).toHaveCount(0);

  await page.goto(`/picks?week=${future.weekId}`);
  await expect(page.getByTestId('week-picker')).toContainText('Week 7');
  await page.goto('/picks?week=999999');
  await expect(page.getByTestId('week-picker')).toContainText('Week 7');
});

test('no schedule loaded: friendly empty state', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await expect(page.getByTestId('no-weeks')).toHaveText("No games yet — the season schedule hasn't been loaded.");
  await page.goto('/weeks');
  await expect(page.getByTestId('no-weeks')).toBeVisible();
});

test('@smoke week picker lists weeks with my result, winner, and navigates back with ?week=', async ({ page, context, request }) => {
  const wk5 = await seedWeek(request, { weekNumber: 5, numGames: 4, tuesday: '2026-09-29T20:00:00Z', results: ['home', 'home', 'home', 'home'] });
  const wk6 = await seedWeek(request, { weekNumber: 6, numGames: 4, tuesday: '2026-10-06T20:00:00Z', results: ['home', 'home', 'away', 'home'] });
  const wk7 = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: '2026-10-13T20:00:00Z' });
  await createUser(request, 'Bob', 'bob');
  await createUser(request, 'Cat', 'cat');
  await setNow(context, '2026-10-14T20:00:00Z');

  // Week 6 (final): admin 3/4 with the closer tiebreaker, Bob 3/4, Cat unpaid.
  const home4 = ['home', 'home', 'home', 'home'] as const;
  await submitPicksFor(request, 'admin', wk6.weekId, [...home4], 44);
  await submitPicksFor(request, 'bob', wk6.weekId, [...home4], 60);
  await submitPicksFor(request, 'cat', wk6.weekId, [...home4], 44);
  for (const u of ['admin', 'bob']) await setPaid(request, u, wk6.weekId);
  // Week 5: only Bob played, so admin did not play.
  await submitPicksFor(request, 'bob', wk5.weekId, [...home4], 40);
  await setPaid(request, 'bob', wk5.weekId);
  await submitPicksFor(request, 'admin', wk7.weekId, [...home4], 40);

  await loginAs(page, 'admin');
  await page.goto('/picks');
  await page.getByTestId('week-picker').click();
  await expect(page).toHaveURL(/\/weeks\?week=\d+&from=%2Fpicks/);
  await expect(page.getByRole('heading', { name: 'Choose week' })).toBeVisible();

  const rows = page.locator('[data-testid^="week-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Week 7');
  await expect(rows.nth(1)).toContainText('Week 6');
  await expect(rows.nth(2)).toContainText('Week 5');

  const r6 = page.getByTestId('week-row-6');
  await expect(r6).toContainText('Final');
  await expect(r6).toContainText('You: 3/4 · 1st');
  await expect(r6).toContainText(/you won/i);
  await expect(r6).toContainText('Winner: Admin');
  await expect(page.getByTestId('week-row-5')).toContainText("You didn't play");
  await expect(page.getByTestId('week-row-5')).toContainText('Winner: Bob');
  await expect(page.getByTestId('week-row-7')).toContainText('Open');
  await expect(page.locator('body')).not.toContainText(/\bof \d+\b(?! picked)/);
  await expect(page.getByText('Next week unlocks Tuesday at 12:00 AM PT.')).toBeVisible();

  await r6.click();
  await expect(page).toHaveURL(new RegExp(`/picks\\?week=${wk6.weekId}$`));
  await expect(page.getByTestId('week-picker')).toContainText('Week 6');
  await expect(page.getByTestId('status-pill')).toHaveText('Final');
  await expect(page.getByTestId('chip-correct')).toContainText('3');
  // Bottom nav preserves the selected week.
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', `/leaderboard?week=${wk6.weekId}`);
  await page.getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard\\?week=${wk6.weekId}$`));
  await expect(page.getByTestId('week-picker')).toContainText('Week 6');

  // Picker remembers where it was opened from.
  await page.getByTestId('week-picker').click();
  await expect(page).toHaveURL(/from=%2Fleaderboard/);
  await page.getByTestId('week-row-5').click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard\\?week=${wk5.weekId}$`));
});

test('week picker shows live progress and tied rank', async ({ page, context, request }) => {
  const wk = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED, results: ['home', 'home', null, null] });
  await createUser(request, 'Bob', 'bob');
  const picks = ['home', 'home', 'home', 'home'] as const;
  await submitPicksFor(request, 'admin', wk.weekId, [...picks], 45);
  await submitPicksFor(request, 'bob', wk.weekId, [...picks], 45);
  await setPaid(request, 'admin', wk.weekId);
  await setPaid(request, 'bob', wk.weekId);
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto('/weeks');
  const row = page.getByTestId('week-row-7');
  await expect(row).toContainText('Live');
  await expect(row).toContainText('You: 2 so far · T-1st');
});

test('header pill is Open for the open week and the picker link keeps the week', async ({ page, context, request }) => {
  const wk = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await expect(page.getByTestId('status-pill')).toHaveAttribute('data-state', 'open');
  await expect(page.getByTestId('week-picker')).toHaveAttribute('href', `/weeks?week=${wk.weekId}&from=%2Fpicks`);
});

const LOCK = Date.parse('2026-10-08T19:00:00Z'); // Thu Oct 8 12:00 PM PT

test('countdown ticks live under an hour (mm:ss)', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, new Date(LOCK - 120_000).toISOString());
  await loginAs(page, 'admin');
  await page.goto('/picks');

  const countdown = page.getByTestId('countdown');
  await expect(countdown).toHaveText(/^\d\d:\d\d left · edit anytime until then$/);
  const secs = async () => {
    const m = /^(\d\d):(\d\d)/.exec((await countdown.textContent()) ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const first = await secs();
  expect(first).toBeLessThanOrEqual(120);
  expect(first).toBeGreaterThan(100);
  await page.waitForTimeout(2500);
  expect(await secs()).toBeLessThan(first);
});

test('countdown reaches zero: shows locked and refreshes into the read-only page', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, new Date(LOCK - 4_000).toISOString());
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await expect(page.getByTestId('countdown')).toContainText('left');
  await expect(page.getByRole('button', { name: /submit|update|pick|enter/i })).not.toHaveCount(0);

  // The server clock moves past the lock (the client keeps ticking from its server-time anchor).
  await setNow(context, new Date(LOCK + 1_000).toISOString());
  // "Picks are locked" is transient (the refresh swaps in the read-only page), so record it.
  await page.evaluate(() => {
    const w = window as unknown as { __sawLocked: boolean };
    w.__sawLocked = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="countdown"]')?.textContent === 'Picks are locked') w.__sawLocked = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await expect(page.getByTestId('status-pill')).toHaveText('Live', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /submit|update/i })).toHaveCount(0);
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __sawLocked: boolean }).__sawLocked)).toBe(true);
});
