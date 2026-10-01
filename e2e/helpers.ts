import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const BASE_URL = 'http://localhost:3100';

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
  scores?: { homeScore: number; awayScore: number },
) {
  const res = await request.post('/api/test/set-result', { data: { gameId, winner, ...scores } });
  expect(res.ok()).toBeTruthy();
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
