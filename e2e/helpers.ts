import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

export type Result = 'home' | 'away' | 'tie' | null;

/** Wipe + migrate + base seed (admin / 1234). Call in beforeEach. */
export async function resetDb(request: APIRequestContext) {
  const res = await request.post('/api/test/reset');
  expect(res.ok()).toBeTruthy();
}

/** Make the app think it is `iso` for every request from this browser context. */
export async function setNow(context: BrowserContext, iso: string) {
  await context.addCookies([{ name: 'x-test-now', value: encodeURIComponent(iso), url: BASE_URL }]);
}

export async function clearNow(context: BrowserContext) {
  await context.clearCookies({ name: 'x-test-now' });
}

/** Creates a real session row for `username` (no PIN check) and sets the `session` cookie on the context. */
export async function loginAs(target: Page | BrowserContext, username: string) {
  const context: BrowserContext = 'newPage' in target ? target : target.context();
  const res = await context.request.post(`${BASE_URL}/api/test/login`, { data: { username } });
  expect(res.ok(), `login as ${username}`).toBeTruthy();
  // The session cookie is stored in the context's cookie jar by the API request.
}

export interface SeedWeekOptions {
  season?: number;
  weekNumber?: number;
  numGames?: number;
  /** per game (kickoff order); non-null => game is final */
  results?: Result[];
  /** any ISO instant inside the desired week; defaults to the current week per the (overridden) now() */
  tuesday?: string;
  lockAt?: string;
}

export async function seedWeek(request: APIRequestContext, opts: SeedWeekOptions = {}) {
  const res = await request.post('/api/test/seed-week', { data: opts });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { weekId: number; gameIds: number[] };
}

export async function setResult(
  request: APIRequestContext,
  gameId: number,
  winner: Result,
  scores?: { homeScore?: number; awayScore?: number; status?: 'postponed' | 'void' },
) {
  const res = await request.post('/api/test/set-result', { data: { gameId, winner, ...scores } });
  expect(res.ok()).toBeTruthy();
}

/** Puts a game in ESPN's in-progress display state (score/quarter/clock), or clears it with `null`. Never scores it. */
export async function setLive(
  request: APIRequestContext,
  gameId: number,
  live: { homeScore: number; awayScore: number; period: number; clock?: string; status?: string } | null,
) {
  const res = await request.post('/api/test/set-live', { data: live === null ? { gameId, live: null } : { gameId, ...live } });
  expect(res.ok()).toBeTruthy();
}

/** Seeds one week from the ESPN fixture (2026 weeks 5, 6, 12). Same return shape as seedWeek. */
export async function importFixtureWeek(request: APIRequestContext, week: number, season = 2026) {
  const res = await request.post(`/api/test/import-fixture-week?week=${week}&season=${season}`);
  expect(res.ok(), 'import fixture week').toBeTruthy();
  return (await res.json()) as { weekId: number; gameIds: number[] };
}

/** Creates a user (no session). PIN defaults to 1234. */
export async function createUser(request: APIRequestContext, firstName: string, username: string, pin = '1234') {
  const res = await request.post('/api/test/create-user', { data: { firstName, username, pin } });
  expect(res.ok(), `create user ${username}`).toBeTruthy();
}

/** Submits a complete entry for `username` (asAdmin: works even when the week is locked). `picks` = sides in kickoff order. */
export async function submitPicksFor(
  request: APIRequestContext,
  username: string,
  weekId: number,
  picks: ('home' | 'away')[] | Record<number, 'home' | 'away'>,
  tiebreaker: number,
  /** Omitted = the user's first entry; 'new' = add an entry; a number = that entry_no. */
  entry?: 'new' | number,
): Promise<{ entryId: number }> {
  const res = await request.post('/api/test/submit-picks', { data: { username, weekId, picks, tiebreaker, entry } });
  expect(res.ok(), `submit picks for ${username}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** Marks one entry_no, or (omitted) every entry of the user that week. */
export async function setPaid(request: APIRequestContext, username: string, weekId: number, paid = true, entryNo?: number) {
  const res = await request.post('/api/test/set-paid', { data: { username, weekId, paid, entryNo } });
  expect(res.ok(), `set paid ${username}`).toBeTruthy();
}

/** Sets a week's own entry fee in cents (null clears it; later weeks carry it over). */
export async function setEntryFee(request: APIRequestContext, weekId: number, cents: number | null) {
  const res = await request.post('/api/test/set-entry-fee', { data: { weekId, cents } });
  expect(res.ok(), 'set entry fee').toBeTruthy();
}

/** UI-driven sign up. Ends on /picks. */
export async function signUpViaUi(page: Page, firstName: string, username: string, pin: string) {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('4-digit PIN').fill(pin);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picks$/);
}

/** UI-driven login. Does not assert the outcome. */
export async function loginViaUi(page: Page, username: string, pin: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('4-digit PIN').fill(pin);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function logoutViaUi(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Asserts the page never shows an "X of N" player count. The only allowed "N of M" phrases are
 * "N of M games final" and "N of M correct" (games, not players).
 */
export async function expectNoPlayerCountOf(page: Page) {
  const text = await page.locator('body').innerText();
  const bad = [...text.matchAll(/\b\d+ of \d+\b(?! games final| correct)/g)].map((m) => m[0]);
  expect(bad, 'found an "X of N" count that is not about games').toEqual([]);
}
