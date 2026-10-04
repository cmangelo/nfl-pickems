import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { loginAs, resetDb, seedWeek, setNow } from './helpers';

/**
 * The bottom nav must keep working while a server action is in flight or lost (phone slept mid-save):
 * server actions run outside React transitions (src/components/use-action.ts), a finished save never pulls
 * the user back from the tab they tapped, and a hung request times out and can be retried.
 */

const WED = '2026-10-07T20:00:00Z';
const FRI = '2026-10-09T20:00:00Z';
const TIMEOUT_MESSAGE = 'No response from the server. Check your connection and try again.';

const isAction = (r: Request) => r.method() === 'POST' && !!r.headers()['next-action'];
const isRscGet = (path: string) => (r: Request) =>
  r.method() === 'GET' && !!r.headers()['rsc'] && new URL(r.url()).pathname === path;

/** Holds matching requests (at most `max`) until `release()`; never answered otherwise (a request lost in flight). */
async function hold(page: Page, match: (r: Request) => boolean, max = Infinity) {
  const held: Route[] = [];
  let holding = true;
  let seen = 0;
  await page.route('**/*', (route) => {
    if (holding && match(route.request()) && seen++ < max) held.push(route);
    else return route.fallback();
  });
  return {
    count: () => held.length,
    release: async () => {
      holding = false;
      for (const r of held.splice(0)) await r.continue();
    },
  };
}

const tab = (page: Page, name: string) => page.getByTestId('bottom-nav').getByRole('link', { name });

async function fillOpenWeek(page: Page, gameIds: number[]) {
  for (const id of gameIds) await page.getByTestId(`pick-${id}-home`).click();
  await page.getByLabel(/Total points in/).fill('45');
}

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('@smoke bottom nav works while a pick save never comes back', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await fillOpenWeek(page, gameIds);

  const actions = await hold(page, isAction);
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(actions.count()).toBe(1);

  await tab(page, 'Leaderboard').click();
  await expect(page).toHaveURL(/\/leaderboard(\?|$)/);
  await expect(page.getByTestId('revealed-card')).toBeVisible();
  await expect(tab(page, 'Leaderboard')).toHaveAttribute('aria-current', 'page');

  await tab(page, 'Games').click();
  await expect(page).toHaveURL(/\/games(\?|$)/);
  await tab(page, 'My Picks').click();
  await expect(page).toHaveURL(/\/picks(\?|$)/);
  await expect(page.getByTestId('progress')).toBeVisible();
});

test('a save that finishes before the tapped tab loads does not pull the user back', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await fillOpenWeek(page, gameIds);

  // The save (a brand-new entry, which navigates to ?entry=<id> when done) is held; so is the Leaderboard page.
  const actions = await hold(page, isAction);
  const board = await hold(page, isRscGet('/leaderboard'));
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible();
  await tab(page, 'Leaderboard').click();
  await expect.poll(board.count).toBeGreaterThan(0);

  // The save lands first; the user must still end up where they tapped.
  const saved = page.waitForResponse((r) => isAction(r.request()));
  await actions.release();
  await saved;
  await board.release();
  await expect(page).toHaveURL(/\/leaderboard(\?|$)/);
  await expect(page.getByTestId('revealed-card')).toBeVisible();
  await expect(page.getByTestId('in-count')).toHaveText('1 in');
  await page.waitForTimeout(500); // give a stray post-save navigation time to show up
  await expect(page).toHaveURL(/\/leaderboard(\?|$)/);

  // The save went through.
  await tab(page, 'My Picks').click();
  for (const id of gameIds) await expect(page.getByTestId(`pick-${id}-home`)).toHaveAttribute('aria-pressed', 'true');
});

test('a hung save times out with a connection message, then a retry saves', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.clock.install();
  await page.goto('/picks');
  await fillOpenWeek(page, gameIds);

  // Only the first save is lost; it stays unanswered for the rest of the test.
  const actions = await hold(page, isAction, 1);
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText(TIMEOUT_MESSAGE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit picks' })).toBeEnabled();

  // Next runs server actions one at a time: the retry must not queue behind the lost one.
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('status')).toContainText('Picks saved.');
  await expect(page).toHaveURL(/entry=\d+/);
  expect(actions.count()).toBe(1);
  await tab(page, 'Leaderboard').click();
  await expect(page.getByTestId('in-count')).toHaveText('1 in');
});

test('leaderboard Refresh that never comes back does not block the nav', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, FRI);
  await loginAs(page, 'admin');
  await page.goto('/leaderboard');

  await hold(page, isAction);
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('refresh')).toHaveText('Refreshing…');
  await tab(page, 'Games').click();
  await expect(page).toHaveURL(/\/games(\?|$)/);
  await expect(tab(page, 'Games')).toHaveAttribute('aria-current', 'page');
});

test('Change PIN that never comes back does not block the nav', async ({ page, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await loginAs(page, 'admin');
  await page.goto('/account/pin');
  await page.getByLabel('Current PIN').fill('1234');
  await page.getByLabel('New PIN', { exact: true }).fill('5678');
  await page.getByLabel('Confirm new PIN').fill('5678');

  await hold(page, isAction);
  await page.getByRole('button', { name: 'Update PIN' }).click();
  await expect(page.getByRole('button', { name: 'Update PIN' })).toBeDisabled();
  await tab(page, 'Leaderboard').click();
  await expect(page).toHaveURL(/\/leaderboard(\?|$)/);
});

test('@smoke the tapped tab lights up while its page loads', async ({ page, context, request }) => {
  await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');

  const games = await hold(page, isRscGet('/games'));
  await tab(page, 'Games').click();
  await expect(tab(page, 'Games').locator('[data-pending="true"]')).toBeVisible();
  await expect(page).toHaveURL(/\/picks(\?|$)/);
  await games.release();
  await expect(page).toHaveURL(/\/games(\?|$)/);
  await expect(tab(page, 'Games')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-pending="true"]')).toHaveCount(0);
});

test('opening a link in a new tab while saving a new entry still moves the form to that entry', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await fillOpenWeek(page, gameIds);

  const actions = await hold(page, isAction);
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeVisible();
  const popup = context.waitForEvent('page');
  await tab(page, 'Leaderboard').click({ modifiers: ['ControlOrMeta'] });
  await (await popup).close();
  await actions.release();

  // The user never left: the saved entry is now the one being edited, so "Update picks" can't add a second entry.
  await expect(page).toHaveURL(/\/picks\?.*entry=\d+/);
  await expect(page.getByRole('button', { name: 'Update picks' })).toBeVisible();
});
