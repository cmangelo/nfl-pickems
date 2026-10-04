import { expect, test } from '@playwright/test';
import {
  createUser,
  expectNoPlayerCountOf,
  loginAs,
  resetDb,
  seedWeek,
  setEntryFee,
  setNow,
  setPaid,
  setResult,
  submitPicksFor,
} from './helpers';

const WED = '2026-10-07T20:00:00Z'; // week locks Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

/** Week 7 (no fixture), 2 games. Ann, Bob, Cy enter; Ann and Bob pay. */
async function seed(request: Parameters<typeof resetDb>[0], results?: ('home' | 'away')[]) {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED, results });
  for (const [n, u] of [['Ann', 'annie'], ['Bob', 'bobby'], ['Cy', 'cyrus']]) await createUser(request, n, u);
  await submitPicksFor(request, 'annie', weekId, ['home', 'home'], 40);
  await submitPicksFor(request, 'bobby', weekId, ['home', 'home'], 48);
  await submitPicksFor(request, 'cyrus', weekId, ['away', 'away'], 44);
  await setPaid(request, 'annie', weekId, true);
  await setPaid(request, 'bobby', weekId, true);
  return { weekId, gameIds };
}

test('@smoke admin sets the entry fee; the pot follows the paid switches', async ({ page, context, request }) => {
  const { weekId } = await seed(request);
  await setNow(context, WED);
  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${weekId}`);

  await expect(page.getByTestId('entry-fee')).toHaveText('Entry fee not set');
  await expect(page.getByTestId('admin-pot')).toHaveCount(0);

  await page.getByRole('button', { name: 'Set' }).click();
  await page.getByLabel(/Entry fee for Week 7/).fill('ten');
  await page.getByRole('button', { name: 'Save fee' }).click();
  await expect(page.getByTestId('fee-error')).toHaveText('Enter an amount like 10 or 12.50.');
  await page.getByLabel(/Entry fee for Week 7/).fill('$10');
  await page.getByRole('button', { name: 'Save fee' }).click();
  await expect(page.getByTestId('entry-fee')).toHaveText('Entry fee $10');
  await expect(page.getByTestId('entry-fee-note')).toContainText('later weeks use it');
  await expect(page.getByTestId('admin-pot')).toHaveText('Pot $20 · 2 paid entries at $10');

  await page.getByTestId('entry-cyrus').getByRole('switch').click();
  await expect(page.getByTestId('admin-pot')).toHaveText('Pot $30 · 3 paid entries at $10');

  await page.reload();
  await expect(page.getByTestId('entry-fee')).toHaveText('Entry fee $10');
  await expect(page.getByTestId('admin-pot')).toHaveText('Pot $30 · 3 paid entries at $10');

  // Change it, then clear it (no earlier week has a fee, so none is set).
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByLabel(/Entry fee for Week 7/)).toHaveValue('10');
  await page.getByLabel(/Entry fee for Week 7/).fill('12.50');
  await page.getByRole('button', { name: 'Save fee' }).click();
  await expect(page.getByTestId('admin-pot')).toHaveText('Pot $37.50 · 3 paid entries at $12.50');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: "Use earlier week's fee" }).click();
  await expect(page.getByTestId('entry-fee')).toHaveText('Entry fee not set');
  await expect(page.getByTestId('admin-pot')).toHaveCount(0);
});

test('a later week carries the fee over', async ({ page, context, request }) => {
  const { weekId } = await seed(request, ['home', 'home']);
  await setEntryFee(request, weekId, 1500);
  const next = await seedWeek(request, { weekNumber: 8, numGames: 2, tuesday: '2026-10-14T20:00:00Z' });
  await setNow(context, '2026-10-14T20:00:00Z');
  await loginAs(page, 'admin');
  await page.goto(`/admin/payments?week=${next.weekId}`);
  await expect(page.getByTestId('entry-fee')).toHaveText('Entry fee $15');
  await expect(page.getByTestId('entry-fee-note')).toHaveText('Carried over from Week 7.');
});

test('players see the pot: filling while open, live, then the payout on the recap', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seed(request);
  await setEntryFee(request, weekId, 1000);
  await loginAs(page, 'cyrus');

  await setNow(context, WED);
  await page.goto('/leaderboard');
  await expect(page.getByTestId('pot')).toContainText('Pot so far');
  await expect(page.getByTestId('pot-amount')).toHaveText('$20');
  await expect(page.getByTestId('pot-detail')).toHaveText('2 paid entries × $10');

  await setNow(context, FRI);
  await page.goto('/leaderboard');
  await expect(page.getByTestId('pot-amount')).toHaveText('$20');
  await expect(page.getByTestId('pot')).toContainText('Winner takes all');
  await expectNoPlayerCountOf(page);

  // Both games home, 21-23 => total 44: Ann (40) and Bob (48) both 2 correct, both 4 off => co-winners.
  await setResult(request, gameIds[0], 'home');
  await setResult(request, gameIds[1], 'home', { homeScore: 23, awayScore: 21 });
  await page.reload();
  await expect(page.getByTestId('winner-names')).toHaveText('Ann and Bob');
  await expect(page.getByTestId('winner-prize')).toHaveText('$10each');
  await expect(page.getByTestId('winner-payout')).toHaveText('Split the $20 pot · $10 each');

  // Bob turns out unpaid: Ann wins outright, the pot shrinks.
  await setPaid(request, 'bobby', weekId, false);
  await page.reload();
  await expect(page.getByTestId('winner-names')).toHaveText('Ann');
  await expect(page.getByTestId('winner-prize')).toHaveText('$10');
  await expect(page.getByTestId('winner-payout')).toHaveText('Wins the $10 pot');
  await expectNoPlayerCountOf(page);
});

test('no fee set: no pot anywhere', async ({ page, context, request }) => {
  await seed(request, ['home', 'home']);
  await setNow(context, FRI);
  await loginAs(page, 'annie');
  await page.goto('/leaderboard');
  await expect(page.getByTestId('winner-banner')).toBeVisible();
  await expect(page.getByTestId('winner-payout')).toHaveCount(0);
  await expect(page.getByTestId('pot')).toHaveCount(0);
});
