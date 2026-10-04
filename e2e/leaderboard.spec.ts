import { expect, test } from '@playwright/test';
import { createUser, expectNoPlayerCountOf, loginAs, resetDb, seedWeek, setNow, setPaid, setResult, submitPicksFor } from './helpers';

const WED = '2026-10-07T20:00:00Z'; // week locks Thu Oct 8 12:00 PM PT
const FRI = '2026-10-09T20:00:00Z';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

/** 4 games, weekNumber 7 (no fixture). Players: Ann, Bob, Cy (paid), Di (unpaid). */
async function seedPlayers(request: Parameters<typeof resetDb>[0]) {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED });
  for (const [n, u] of [['Ann', 'annie'], ['Bob', 'bobby'], ['Cy', 'cyrus'], ['Di', 'diana']]) await createUser(request, n, u);
  const H = 'home' as const;
  const A = 'away' as const;
  await submitPicksFor(request, 'annie', weekId, [H, H, H, H], 40);
  await submitPicksFor(request, 'bobby', weekId, [H, H, A, A], 50);
  await submitPicksFor(request, 'cyrus', weekId, [A, A, A, A], 44);
  await submitPicksFor(request, 'diana', weekId, [H, H, H, H], 45);
  for (const u of ['annie', 'bobby', 'cyrus']) await setPaid(request, u, weekId, true);
  return { weekId, gameIds };
}

test('@smoke open week: "N in" with names, "(you)", no "of N", Games shows count only', async ({ page, context, request }) => {
  const { weekId } = await seedPlayers(request);
  await setNow(context, WED);
  await loginAs(page, 'annie');
  await page.goto('/leaderboard');
  await expect(page.getByTestId('revealed-title')).toHaveText('Picks revealed Thu 12:00 PM PT');
  await expect(page.getByTestId('in-count')).toHaveText('4 in'); // paid or not
  const list = page.getByTestId('in-list');
  await expect(list).toContainText('Ann (you)');
  for (const n of ['Bob', 'Cy', 'Di']) await expect(list).toContainText(n);
  await expect(page.getByText(/not yet/i)).toHaveCount(0);
  await expectNoPlayerCountOf(page);
  await expect(page.getByTestId('status-pill')).toHaveText('Open');

  await page.goto(`/games?week=${weekId}`);
  await expect(page.getByTestId('in-count')).toHaveText('4 in');
  await expect(page.getByTestId('in-list')).toHaveCount(0);
  await expectNoPlayerCountOf(page);

  // Picks stay hidden: the drill-down bounces back to the leaderboard before lock.
  await page.goto(`/leaderboard/player/${1}?week=${weekId}`);
  await expect(page).toHaveURL(/\/leaderboard\?week=/);
});

test('@smoke live leaderboard: shared ranks, unpaid not counted, drill-down, refresh', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedPlayers(request);
  // Results: g0 home, g1 away, g2 away => Bob 2, Cy 2, Ann 1; Di (unpaid) 1. Game 3 (Monday, tiebreaker) pending.
  await setResult(request, gameIds[0], 'home');
  await setResult(request, gameIds[1], 'away');
  await setResult(request, gameIds[2], 'away');
  await setNow(context, FRI);
  await loginAs(page, 'annie');
  await page.goto('/leaderboard');

  await expect(page.getByTestId('live-status')).toHaveText('Updated just now · 3 of 4 games final');
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('T-1st');
  await expect(rows.nth(0)).toContainText('Bob');
  await expect(rows.nth(1)).toContainText('T-1st');
  await expect(rows.nth(1)).toContainText('Cy');
  await expect(rows.nth(2)).toContainText('3rd');
  await expect(rows.nth(2)).not.toContainText('T-');
  await expect(rows.nth(2)).toContainText('Ann');
  await expect(rows.nth(2)).toContainText('YOU');
  await expect(rows.nth(0).getByTestId('tb-guess')).toHaveText('50');
  await expect(rows.nth(0).getByTestId('correct-count')).toHaveText('2');
  await expect(page.getByTestId('tb-footnote')).toContainText('same number correct share a rank');
  await expect(page.getByTestId('tb-footnote')).toContainText(/\w+ @ \w+/);

  const unpaid = page.getByTestId('not-counted');
  await expect(unpaid).toContainText('Not counted · unpaid');
  await expect(unpaid).toContainText('Di');
  await expect(unpaid).toContainText('1 correct');
  await expect(rows.filter({ hasText: 'Di' })).toHaveCount(0);
  await expectNoPlayerCountOf(page);

  // Drill-down: Bob's picks (home, home, away, away): right, wrong, right, pending.
  await rows.nth(0).click();
  await expect(page).toHaveURL(/\/leaderboard\/player\/\d+\?week=\d+/);
  await expect(page.getByTestId('player-heading')).toContainText("Bob's picks");
  await expect(page.getByTestId(`game-${gameIds[0]}`)).toHaveAttribute('data-result', 'right');
  await expect(page.getByTestId(`game-${gameIds[1]}`)).toHaveAttribute('data-result', 'wrong');
  await expect(page.getByTestId(`game-${gameIds[2]}`)).toHaveAttribute('data-result', 'right');
  await expect(page.getByTestId(`game-${gameIds[3]}`)).toHaveAttribute('data-result', 'pending');
  await expect(page.getByTestId('tiebreaker-guess')).toContainText('50');
  await page.getByTestId('back-to-leaderboard').click();
  await expect(page).toHaveURL(new RegExp(`/leaderboard\\?week=${weekId}`));

  // Unpaid player's picks are viewable and flagged.
  await page.getByTestId('not-counted').getByRole('link', { name: /Di/ }).click();
  await expect(page.getByTestId('player-unpaid')).toBeVisible();
  await page.goBack();

  // Refresh: within 5 minutes it is a no-op; after 10 minutes it runs.
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('refresh-status')).toContainText('Already up to date');
  await setNow(context, '2026-10-09T20:10:00Z');
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('refresh-status')).toContainText('Scores refreshed');
  await expect(page.getByTestId('live-status')).toContainText('Updated just now');
});

test('games tab: counts only, "Your pick" on my side (even if unpaid), no name lists', async ({ page, context, request }) => {
  const { gameIds } = await seedPlayers(request);
  await setResult(request, gameIds[0], 'home', { homeScore: 27, awayScore: 17 });
  await setNow(context, FRI);
  await loginAs(page, 'diana'); // unpaid viewer, picked home on game 0
  await page.goto('/games');

  await expect(page.getByText('Who picked what')).toBeVisible();
  await expect(page.getByTestId('counted-players')).toHaveText('3 counted players');
  await expect(page.getByTestId('games-status')).toHaveText('In progress · 1 of 4 games final');
  // Counted entries on game 0: Ann H, Bob H, Cy A => 1 away, 2 home
  const g0 = gameIds[0];
  await expect(page.getByTestId(`split-${g0}-home`)).toContainText('2 entries');
  await expect(page.getByTestId(`split-${g0}-away`)).toContainText('1 entry');
  await expect(page.getByTestId(`split-${g0}-home`)).toContainText('Your pick');
  await expect(page.getByTestId(`split-${g0}-away`)).not.toContainText('Your pick');
  await expect(page.getByTestId(`split-${g0}-home`)).toHaveAttribute('data-winner', 'true');
  await expect(page.getByTestId(`game-status-${g0}`)).toHaveText('Final');
  await expect(page.getByTestId(`split-${gameIds[1]}-home`)).toHaveAttribute('data-winner', 'false');
  await expect(page.getByTestId(`game-status-${gameIds[1]}`)).toContainText('PT');
  await expect(page.getByTestId(`split-bar-${g0}`)).toHaveAttribute('aria-label', /^1 entry picked \w+ \(33%\), 2 entries picked \w+ \(67%\)$/);
  await expect(page.getByTestId(`split-pct-${g0}-away`)).toHaveText(/33%$/);
  await expect(page.getByTestId(`split-pct-${g0}-home`)).toHaveText(/67%$/);
  // No name lists.
  for (const n of ['Ann', 'Bob', 'Cy']) await expect(page.getByText(n, { exact: true })).toHaveCount(0);
  await expectNoPlayerCountOf(page);
});

test('final recap: co-winners, stats, upset with names, tiebreaker diff, unpaid not counted', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedPlayers(request);
  // g0 home, g1 home, g2 away, g3 home (27-17 => total 44). Ann 3, Bob 3, Cy 1.
  // Ann diff 4, Bob diff 6 => Ann wins outright.
  await setResult(request, gameIds[0], 'home');
  await setResult(request, gameIds[1], 'home');
  await setResult(request, gameIds[2], 'away');
  await setResult(request, gameIds[3], 'home', { homeScore: 27, awayScore: 17 });
  await setNow(context, FRI);
  await loginAs(page, 'cyrus');
  await page.goto('/leaderboard');

  await expect(page.getByTestId('winner-title')).toHaveText('Week 7 winner');
  await expect(page.getByTestId('winner-names')).toHaveText('Ann');
  await expect(page.getByTestId('winner-detail')).toHaveText('3 of 4 correct · outright win');
  await expect(page.getByTestId('stat-average')).toContainText('2.3');
  await expect(page.getByTestId('stat-entries')).toContainText('3');
  await expect(page.getByTestId('stat-most')).toContainText('3 correct');
  await expect(page.getByTestId('stat-most')).toContainText('Ann and Bob');
  await expect(page.getByTestId('stat-fewest')).toContainText('1 correct');
  await expect(page.getByTestId('stat-fewest')).toContainText('Cy');
  // Upset: g3 home won; Cy picked away (wrong) and Bob picked away (wrong); Ann right => 2 wrong. g2 (away won): Ann wrong => 1.
  await expect(page.getByTestId('upset-headline')).toContainText(/\w+ over \w+, 27–17/);
  await expect(page.getByTestId('upset-wrong')).toHaveText('2 entries got it wrong');
  await expect(page.getByTestId('upset-right')).toHaveText('Only 1 entry picked it (Ann)');
  await expect(page.getByTestId('mnf-total')).toContainText('44 total points');
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows.nth(0)).toContainText('1st');
  await expect(rows.nth(0)).toContainText('Ann');
  await expect(rows.nth(0).getByTestId('tb-guess')).toHaveText('40 (±4)');
  await expect(rows.nth(1).getByTestId('tb-guess')).toHaveText('50 (±6)');
  await expect(rows.nth(1)).toContainText('2nd');
  await expect(rows.nth(2)).toContainText('YOU');
  await expect(page.getByTestId('not-counted')).toContainText('Di');
  await expect(page.getByTestId('refresh')).toHaveCount(0);
  await expect(page.getByTestId('status-pill')).toHaveText('Final');
  await expectNoPlayerCountOf(page);

  // Games tab on a final week: counts and winners.
  await page.goto(`/games?week=${weekId}`);
  await expect(page.getByTestId('games-status')).toHaveText('Final · 4 of 4 games final');
  await expect(page.getByTestId(`split-${gameIds[3]}-home`)).toHaveAttribute('data-winner', 'true');
  await expect(page.getByTestId(`split-${gameIds[3]}-away`)).toContainText('Your pick');
  await expectNoPlayerCountOf(page);
});

test('final recap: tied players are co-winners', async ({ page, context, request }) => {
  const { weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED, results: ['home', 'home'] });
  for (const [n, u] of [['Ann', 'annie'], ['Bob', 'bobby'], ['Cy', 'cyrus']]) await createUser(request, n, u);
  // Seeded final total is 44; guesses 40 and 48 are both off by 4.
  await submitPicksFor(request, 'annie', weekId, ['home', 'home'], 40);
  await submitPicksFor(request, 'bobby', weekId, ['home', 'home'], 48);
  await submitPicksFor(request, 'cyrus', weekId, ['away', 'away'], 44);
  for (const u of ['annie', 'bobby', 'cyrus']) await setPaid(request, u, weekId, true);
  await setNow(context, FRI);
  await loginAs(page, 'cyrus');
  await page.goto('/leaderboard');
  await expect(page.getByTestId('winner-title')).toHaveText('Week 7 co-winners');
  await expect(page.getByTestId('winner-names')).toHaveText('Ann and Bob');
  await expect(page.getByTestId('winner-detail')).toContainText('tied, co-winners');
  const rows = page.locator('[data-testid^="rank-row-"]');
  await expect(rows.nth(0)).toContainText('T-1st');
  await expect(rows.nth(1)).toContainText('T-1st');
  await expect(rows.nth(2)).toContainText('3rd');
  await expectNoPlayerCountOf(page);
});
