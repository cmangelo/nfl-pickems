import { expect, test } from '@playwright/test';
import {
  createUser,
  importFixtureWeek,
  loginAs,
  loginViaUi,
  resetDb,
  seedWeek,
  setNow,
  setPaid,
  submitPicksFor,
} from './helpers';

const WED = '2026-10-07T20:00:00Z'; // Wed Oct 7, 1 PM PT; the week locks Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('non-admin gets 404 on every admin page and sees no Admin tab', async ({ page, context, request }) => {
  await createUser(request, 'Bob', 'bob');
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'bob');
  for (const path of ['/admin', '/admin/payments', '/admin/games', '/admin/players', `/admin/picks/1?week=${weekId}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  await page.goto('/picks');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('@smoke payments: toggle paid updates the summary and persists', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await createUser(request, 'Cyd', 'cyd');
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await submitPicksFor(request, 'ann', weekId, ['home', 'home'], 40);
  await submitPicksFor(request, 'bob', weekId, ['away', 'home'], 41);
  await setNow(context, WED);
  await loginAs(page, 'admin');

  await page.goto(`/admin?week=${weekId}`);
  await expect(page).toHaveURL(new RegExp(`/admin/payments\\?week=${weekId}$`));
  await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link')).toHaveText(['Payments', 'Games', 'Players']);
  await expect(page.getByTestId('week-picker')).toContainText('Week 7');

  const summary = page.getByTestId('paid-summary');
  await expect(summary).toHaveText('0 paid · 2 unpaid');
  await expect(page.getByText('Everyone starts unpaid. Only paid entries count in this week\'s results. Change anytime, even after the week ends.')).toBeVisible();
  await expect(page.getByTestId('entry-ann')).toContainText('Ann');
  await expect(page.getByTestId('entry-ann')).toContainText('@ann');
  await expect(page.getByTestId('entry-ann')).toContainText('Submitted ');
  await expect(page.getByTestId('entry-cyd')).toHaveCount(0);

  const annSwitch = page.getByTestId('entry-ann').getByRole('switch');
  await expect(annSwitch).toHaveText('Unpaid');
  await annSwitch.click();
  await expect(annSwitch).toHaveText('Paid');
  await expect(summary).toHaveText('1 paid · 1 unpaid');

  await page.reload();
  await expect(summary).toHaveText('1 paid · 1 unpaid');
  await expect(page.getByTestId('entry-ann').getByRole('switch')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('entry-ann').getByRole('switch').click();
  await expect(summary).toHaveText('0 paid · 2 unpaid');

  const text = (await page.locator('main').innerText()).toLowerCase();
  expect(text).not.toContain("didn't submit");
  expect(text).not.toContain('did not submit');
  expect(text).not.toContain(' of ');
});

test('payments can be changed after the week is final', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED, results: ['home', 'away'] });
  await submitPicksFor(request, 'ann', weekId, ['home', 'home'], 40);
  await setPaid(request, 'ann', weekId, true);
  await setNow(context, '2026-10-20T20:00:00Z');
  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('1 paid · 0 unpaid');
  await page.getByTestId('entry-ann').getByRole('switch').click();
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 1 unpaid');
});

test('games: score override marks the game final + manual, and My Picks shows right/wrong; clear override', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await submitPicksFor(request, 'ann', weekId, ['home', 'home'], 40);
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);

  const g1 = page.getByTestId(`admin-game-${gameIds[0]}`);
  await expect(g1).toContainText(/ @ .* · \w{3} \d/);
  await expect(g1.getByText('manual')).toHaveCount(0);
  await g1.getByRole('button', { name: /^Edit / }).click();
  await g1.getByLabel(/away\) score/).fill('10');
  await g1.getByLabel(/home\) score/).fill('20');
  await expect(g1.getByLabel('Winner')).toHaveValue('home');
  await g1.getByLabel(/away\) score/).fill('20');
  await expect(g1.getByLabel('Winner')).toHaveValue('tie');
  await g1.getByLabel(/away\) score/).fill('10');
  await expect(g1.getByLabel('Winner')).toHaveValue('home');
  await g1.getByRole('button', { name: 'Save' }).click();
  await expect(g1).toContainText(/ 10 @ .* 20 · Final/);
  await expect(g1.getByText('manual')).toBeVisible();

  // Second game: away wins, so Ann's home pick is wrong.
  const g2 = page.getByTestId(`admin-game-${gameIds[1]}`);
  await g2.getByRole('button', { name: /^Edit / }).click();
  await g2.getByLabel(/away\) score/).fill('31');
  await g2.getByLabel(/home\) score/).fill('17');
  await expect(g2.getByLabel('Winner')).toHaveValue('away');
  await g2.getByRole('button', { name: 'Save' }).click();
  await expect(g2).toContainText(/ 31 @ .* 17 · Final/);

  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByRole('img', { name: 'Correct' })).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Wrong' })).toHaveCount(1);

  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  const again = page.getByTestId(`admin-game-${gameIds[0]}`);
  await again.getByRole('button', { name: /^Edit / }).click();
  await again.getByRole('button', { name: 'Clear override' }).click();
  await expect(again).toContainText(/ @ .* · \w{3} \d/);
  await expect(again.getByText('manual')).toHaveCount(0);
});

test('games: an earlier lock time locks the week for players; reset restores it', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('status-pill')).toHaveText('Open');

  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  await expect(page.getByTestId('lock-time')).toHaveText('Picks lock Thu Oct 8, 12:00 PM PT');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Lock time (Pacific Time)').fill('2026-10-07T12:00');
  await page.getByRole('button', { name: 'Save lock time' }).click();
  await expect(page.getByTestId('lock-time')).toContainText('Picks lock Wed Oct 7, 12:00 PM PT');
  await expect(page.getByTestId('lock-time')).toContainText('custom');

  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('status-pill')).toHaveText('Live');

  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.getByTestId('lock-time')).toHaveText('Picks lock Thu Oct 8, 12:00 PM PT');

  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('status-pill')).toHaveText('Open');
});

test('games: Sync from ESPN now works with fixtures', async ({ page, context, request }) => {
  const { weekId } = await importFixtureWeek(request, 5);
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto(`/admin/games?week=${weekId}`);
  await expect(page.getByTestId('last-synced')).toContainText('Last synced never');
  await page.getByRole('button', { name: 'Sync from ESPN now' }).click();
  await expect(page.getByRole('status')).toContainText(/Synced \d+ games from ESPN/);
  await expect(page.getByTestId('last-synced')).toContainText('Wed Oct 7, 1:00 PM PT');
  await expect(page.getByText(/ · Final$/).first()).toBeVisible();
});

test('edit a user\'s picks after lock, including a user with no entry', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await submitPicksFor(request, 'bob', weekId, ['home', 'home'], 40);
  await setNow(context, FRI);
  await loginAs(page, 'admin');

  // Ann has no entry: create one from the Games tab.
  await page.goto(`/admin/games?week=${weekId}`);
  await page.getByRole('link', { name: 'Edit picks for Ann' }).click();
  await expect(page.getByRole('heading', { name: /Edit picks: Ann/ })).toBeVisible();
  const submit = page.getByRole('button', { name: /pick|enter|submit|update/i }).last();
  await expect(submit).toBeDisabled();
  for (const id of gameIds) await page.getByTestId(`pick-${id}-away`).click();
  await page.getByLabel(/Total points in/).fill('33');
  await submit.click();
  await expect(page.getByRole('status')).toHaveText('Picks saved for Ann.');

  // Edit Bob's existing picks from Payments.
  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 2 unpaid');
  await page.getByRole('link', { name: 'Edit picks for Bob' }).click();
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`pick-${gameIds[0]}-away`).click();
  await page.getByLabel(/Total points in/).fill('55');
  await page.getByRole('button', { name: 'Update picks' }).click();
  await expect(page.getByRole('status')).toHaveText('Picks saved for Bob.');

  await loginAs(page, 'ann');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('status-pill')).toHaveText('Live');
  await expect(page.getByTestId('no-entry')).toHaveCount(0);
  await loginAs(page, 'bob');
  await page.goto(`/picks?week=${weekId}`);
  await expect(page.getByTestId('no-entry')).toHaveCount(0);
});

test('@smoke players: header shows Admin without week picker; reset PIN lets the user log in with it', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann', '1111');
  await setNow(context, WED);
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await loginAs(page, 'admin');
  await page.goto('/admin/players');
  await expect(page.getByTestId('admin-title')).toHaveText('Admin');
  await expect(page.getByTestId('week-picker')).toHaveCount(0);
  await expect(page.getByTestId('player-admin')).toContainText('ADMIN');
  await expect(page.getByTestId('player-ann')).toContainText('@ann');

  // Admin can't demote/remove self: no ⋯ menu on own row.
  await expect(page.getByTestId('player-admin').getByRole('button', { name: /More actions/ })).toHaveCount(0);

  await page.getByTestId('player-ann').getByRole('button', { name: 'Reset PIN' }).click();
  await page.getByLabel('New PIN for Ann').fill('9876');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByText('PIN reset for Ann.')).toBeVisible();

  const fresh = await context.browser()!.newContext({ baseURL: page.url().split('/admin')[0] });
  const p2 = await fresh.newPage();
  await loginViaUi(p2, 'ann', '1111');
  await expect(p2.getByRole('alert')).toBeVisible();
  await loginViaUi(p2, 'ann', '9876');
  await expect(p2).toHaveURL(/\/picks$/);
  await fresh.close();
});

test('players: make admin gives the Admin tab; remove admin; remove player', async ({ page, context, request }) => {
  await createUser(request, 'Ann', 'ann');
  await createUser(request, 'Bob', 'bob');
  await setNow(context, WED);
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await submitPicksFor(request, 'bob', weekId, ['home', 'home'], 40);
  await loginAs(page, 'admin');
  await page.goto('/admin/players');

  const ann = page.getByTestId('player-ann');
  await ann.getByRole('button', { name: 'More actions for Ann' }).click();
  await page.getByRole('menuitem', { name: 'Make admin' }).click();
  await expect(ann).toContainText('ADMIN');

  await loginAs(page, 'ann');
  await page.goto('/picks');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })).toBeVisible();

  await loginAs(page, 'admin');
  await page.goto('/admin/players');
  await ann.getByRole('button', { name: 'More actions for Ann' }).click();
  await page.getByRole('menuitem', { name: 'Remove admin' }).click();
  await expect(ann).not.toContainText('ADMIN');

  const bob = page.getByTestId('player-bob');
  await bob.getByRole('button', { name: 'More actions for Bob' }).click();
  await page.getByRole('menuitem', { name: 'Remove player' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Remove Bob');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(bob).toBeVisible();
  await bob.getByRole('button', { name: 'More actions for Bob' }).click();
  await page.getByRole('menuitem', { name: 'Remove player' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByTestId('player-bob')).toHaveCount(0);

  await page.goto(`/admin/payments?week=${weekId}`);
  await expect(page.getByTestId('paid-summary')).toHaveText('0 paid · 0 unpaid');
});

test('week picker from admin edit-picks returns to the same page with the chosen week', async ({ page, context, request }) => {
  const wk6 = await seedWeek(request, { weekNumber: 6, numGames: 2, tuesday: '2026-10-06T20:00:00Z' });
  const wk7 = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: '2026-10-13T20:00:00Z' });
  await setNow(context, '2026-10-14T20:00:00Z');
  await loginAs(page, 'admin');
  await page.goto(`/admin/picks/1?week=${wk7.weekId}`);
  await expect(page.getByTestId('week-picker')).toContainText('Week 7');

  await page.getByTestId('week-picker').click();
  await expect(page).toHaveURL(/\/weeks\?week=\d+&from=%2Fadmin%2Fpicks%2F1$/);
  await page.getByTestId('week-row-6').click();
  await expect(page).toHaveURL(new RegExp(`/admin/picks/1\\?week=${wk6.weekId}$`));
  await expect(page.getByTestId('week-picker')).toContainText('Week 6');

  // Same for a player's picks on the leaderboard.
  await page.goto(`/leaderboard/player/1?week=${wk6.weekId}`);
  await page.getByTestId('week-picker').click();
  await expect(page).toHaveURL(/from=%2Fleaderboard%2Fplayer%2F1$/);
  await page.getByTestId('week-row-7').click();
  await expect(page).toHaveURL(new RegExp(`/(leaderboard/player/1|leaderboard)\\?week=${wk7.weekId}$`));
});
