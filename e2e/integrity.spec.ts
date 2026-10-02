import { expect, test } from '@playwright/test';
import { createUser, loginAs, resetDb, seedWeek, setNow, setPaid, setResult, submitPicksFor } from './helpers';

const WED = '2026-10-07T20:00:00Z'; // Wed Oct 7, 1 PM PT; week 7 locks Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('M1: the admin cannot set a lock later than the first kickoff', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  await expect(page.getByTestId('lock-time')).toHaveText('Picks lock Thu Oct 8, 12:00 PM PT');
  await page.getByRole('button', { name: 'Change' }).click();
  // First seeded kickoff is Thu ~8:15 PM PT; Fri noon is later.
  await page.getByLabel('Lock time (Pacific Time)').fill('2026-10-09T12:00');
  await page.getByRole('button', { name: 'Save lock time' }).click();
  await expect(page.getByTestId('lock-error')).toHaveText("The lock can't be later than the week's first kickoff.");
  await expect(page.getByTestId('lock-time')).toHaveText('Picks lock Thu Oct 8, 12:00 PM PT');

  // An earlier lock is still fine.
  await page.getByLabel('Lock time (Pacific Time)').fill('2026-10-08T10:00');
  await page.getByRole('button', { name: 'Save lock time' }).click();
  await expect(page.getByTestId('lock-time')).toContainText('Picks lock Thu Oct 8, 10:00 AM PT');
});

test('M5: removing a player keeps past results, drops the open-week entry, reserves the username', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  const past = await seedWeek(request, { weekNumber: 3, numGames: 2, tuesday: '2026-09-22T20:00:00Z', results: ['home', 'away'] });
  const open = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  for (const u of ['ann', 'bob']) {
    await submitPicksFor(request, u, past.weekId, ['home', 'away'], 40);
    await setPaid(request, u, past.weekId, true);
    await submitPicksFor(request, u, open.weekId, ['home', 'home'], 41);
  }
  await setNow(context, WED);
  await loginAs(page, 'admin');

  await page.goto(`/admin/payments?week=${open.weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 2 unpaid');

  await page.goto('/admin/players');
  await page.getByTestId('player-bob').getByRole('button', { name: 'More actions for Bob' }).click();
  await page.getByRole('menuitem', { name: 'Remove player' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Results from past weeks stay');
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByTestId('player-bob')).toHaveCount(0);
  await expect(page.getByTestId('player-ann')).toBeVisible();

  // Open week: Bob is out. Past week: Bob's result is still there.
  await page.goto(`/admin/payments?week=${open.weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 1 unpaid');
  await expect(page.getByTestId('entry-bob')).toHaveCount(0);
  await page.goto(`/leaderboard?week=${past.weekId}`);
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Bob' })).toHaveCount(1);
  await expect(page.getByTestId('winner-banner')).toBeVisible();

  // The username stays reserved.
  const fresh = await context.browser()!.newContext({ baseURL: page.url().split('/leaderboard')[0] });
  const p2 = await fresh.newPage();
  await p2.goto('/login');
  await p2.getByRole('tab', { name: 'Sign up' }).click();
  await p2.getByLabel('First name').fill('Bobby');
  await p2.getByLabel('Username').fill('bob');
  await p2.getByLabel('4-digit PIN').fill('4321');
  await p2.getByRole('button', { name: 'Create account' }).click();
  await expect(p2.getByTestId('auth-error')).toContainText('taken');
  await fresh.close();
});

test('M6: an admin cannot peek at others\' picks before the lock, edits are audited, own edits stop at the lock', async ({
  page,
  context,
  request,
}) => {
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await submitPicksFor(request, 'ann', weekId, ['home', 'away'], 40);
  await submitPicksFor(request, 'admin', weekId, ['away', 'away'], 33);
  await setNow(context, WED);
  await loginAs(page, 'admin');

  // Another player's entry while open: blank form and a notice.
  await page.goto(`/admin/payments?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Ann' }).click();
  await expect(page.getByTestId('picks-hidden-notice')).toHaveText(/Picks are hidden until the lock\. Saving replaces this player's picks\./);
  for (const id of gameIds) {
    await expect(page.getByTestId(`pick-${id}-home`)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(`pick-${id}-away`)).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.getByLabel(/Total points in/)).toHaveValue('');
  // Their own entry is shown as normal.
  await page.goto(`/admin/payments?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Admin' }).click();
  await expect(page.getByTestId('picks-hidden-notice')).toHaveCount(0);
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'true');

  // Replace Ann's picks (blank form -> save).
  await page.goto(`/admin/payments?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Ann' }).click();
  for (const id of gameIds) await page.getByTestId(`pick-${id}-home`).click();
  await page.getByLabel(/Total points in/).fill('55');
  await page.getByRole('button', { name: /pick|enter|submit|update/i }).last().click();
  await expect(page.getByRole('status')).toHaveText('Picks saved for Ann.');

  // After the lock: audit line in Payments, Ann's My Picks and the drill-down; the admin can still edit their own picks.
  await setNow(context, FRI);
  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('edited-ann')).toHaveText('Edited by admin Admin · Wed 1:00 PM PT');
  await expect(page.getByTestId('edited-admin')).toHaveCount(0);
  await page.goto(`/admin/picks/1?week=${weekId}`);
  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`pick-${gameIds[0]}-home`).click();
  await page.getByRole('button', { name: /pick|enter|submit|update/i }).last().click();
  await expect(page.getByRole('status')).toHaveText('Picks saved for Admin.');
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/admin/picks/2?week=${weekId}`); // Ann: allowed after the lock, with her real picks shown
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');

  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('admin-edited')).toHaveText('Edited by admin Admin · Wed 1:00 PM PT');
  await loginAs(page, 'bob');
  await page.goto(`/leaderboard/player/2?week=${weekId}`);
  await expect(page.getByTestId('admin-edited')).toHaveText('Edited by admin Admin · Wed 1:00 PM PT');
  // The admin's own post-lock change is flagged publicly, like any admin edit.
  await page.goto(`/leaderboard/player/1?week=${weekId}`);
  await expect(page.getByTestId('admin-edited')).toHaveText('Edited by admin Admin · Fri 1:00 PM PT');
});

test('M7: postponed games stay pending; a voided game counts for nobody and the week can finish', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 3, tuesday: WED });
  await submitPicksFor(request, 'ann', weekId, ['home', 'home', 'home'], 40);
  await setPaid(request, 'ann', weekId, true);
  await setResult(request, gameIds[0], 'home'); // final, Ann right
  await setResult(request, gameIds[1], null, { status: 'postponed' });
  await setNow(context, FRI);

  // Postponed: labelled everywhere, still pending, week not final.
  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId(`game-${gameIds[1]}`)).toContainText('Postponed');
  await expect(page.getByTestId('chip-correct')).toContainText('1');
  await expect(page.getByTestId('chip-pending')).toContainText('2');
  await page.goto(`/games?week=${weekId}`);
  await expect(page.getByTestId(`game-status-${gameIds[1]}`)).toHaveText('Postponed');
  await expect(page.getByTestId('games-status')).toContainText('1 of 3 games final');

  // Admin voids it.
  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  const row = page.getByTestId(`admin-game-${gameIds[1]}`);
  await expect(row).toContainText('Postponed');
  await row.getByRole('button', { name: /^Edit / }).click();
  await row.getByRole('button', { name: 'Void game' }).click();
  await expect(row).toContainText('Void');
  await expect(row.getByText('manual')).toBeVisible();

  // Void: excluded from the total and from the player's counts, shown greyed on Games.
  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId(`game-${gameIds[1]}`)).toHaveAttribute('data-result', 'void');
  await expect(page.getByTestId(`game-${gameIds[1]}`)).toContainText('Void');
  await expect(page.getByTestId('chip-pending')).toContainText('1');
  await page.goto(`/games?week=${weekId}`);
  await expect(page.getByTestId(`game-status-${gameIds[1]}`)).toHaveText('Void');
  await expect(page.getByTestId(`game-card-${gameIds[1]}`)).toHaveAttribute('data-void', 'true');
  await expect(page.getByTestId(`split-${gameIds[1]}-home`)).toContainText('1 picked');
  await expect(page.getByTestId('games-status')).toContainText('1 of 2 games final');
  await page.goto(`/leaderboard?week=${weekId}`);
  await expect(page.getByTestId('live-status')).toContainText('1 of 2 games final');

  // The last real game finishes: the week is final with the void game left out.
  await setResult(request, gameIds[2], 'away');
  await page.goto(`/leaderboard?week=${weekId}`);
  await expect(page.getByTestId('final-status')).toHaveText('Final · 2 of 2 games final');
  await expect(page.getByTestId('winner-detail')).toContainText('1 of 2 correct');
});
