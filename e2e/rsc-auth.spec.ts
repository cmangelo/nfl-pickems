import { expect, test, type APIRequestContext } from '@playwright/test';
import { BASE_URL, createUser, resetDb, seedWeek, submitPicksFor } from './helpers';

// Next.js partial rendering skips layouts the client claims to already have, so layout-only auth is bypassable.
// These tests send that crafted RSC request and assert every page enforces auth itself.

const WED = '2026-10-07T20:00:00Z'; // the week is open until Thu 12:00 PM PT
const FIRST = 'Zebediah';
const USERNAME = 'zeb_victim';

const TREE = encodeURIComponent(
  JSON.stringify(['', { children: ['(app)', { children: ['admin', { children: ['games', { children: ['__PAGE__', {}] }] }] }] }, null, null, true]),
);
const RSC_HEADERS = { RSC: '1', 'Next-Router-State-Tree': TREE, 'x-test-now': WED };

let victimId = 0;
let weekId = 0;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  await createUser(request, FIRST, USERNAME);
  await createUser(request, 'Mallory', 'mallory');
  ({ weekId } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED }));
  await submitPicksFor(request, USERNAME, weekId, ['home', 'away'], 41);
  const res = await request.post('/api/test/login', { data: { username: USERNAME } });
  victimId = (await res.json()).userId;
});

/** Pages that must never show another player's picks/usernames to this viewer. */
function protectedPaths() {
  return [
    `/admin/picks/${victimId}?week=${weekId}`,
    `/admin/payments?week=${weekId}`,
    `/admin/games?week=${weekId}`,
    `/admin/players`,
    `/leaderboard/player/${victimId}?week=${weekId}`,
  ];
}

/** Pages that are fine for any logged-in player (the open-week leaderboard lists first names of entrants by design). */
function appPaths() {
  return [
    `/leaderboard?week=${weekId}`,
    `/games?week=${weekId}`,
    `/picks?week=${weekId}`,
    `/weeks?week=${weekId}`,
    `/account/pin`,
  ];
}

async function expectNoLeak(request: APIRequestContext, label: string, paths: string[]) {
  const leaks: string[] = [];
  for (const path of paths) {
    const res = await request.get(`${BASE_URL}${path}`, { headers: RSC_HEADERS, maxRedirects: 0 });
    const body = await res.text();
    if (body.includes(FIRST) || body.includes(USERNAME)) leaks.push(`${path} (status ${res.status()})`);
    expect(res.status(), `${label} ${path}: status`).not.toBe(500);
  }
  expect(leaks, `${label}: paths that leaked another player's data`).toEqual([]);
}

test('crafted RSC request with no cookie leaks nothing', async ({ playwright }) => {
  const anon = await playwright.request.newContext();
  await expectNoLeak(anon, 'anonymous', [...protectedPaths(), ...appPaths()]);
  await anon.dispose();
});

test('crafted RSC request as a non-admin leaks no admin data', async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
  const login = await ctx.post('/api/test/login', { data: { username: 'mallory' } });
  expect(login.ok()).toBeTruthy();
  await expectNoLeak(ctx, 'non-admin', protectedPaths());
  await ctx.dispose();
});

test('the same crafted request still works for an admin (sanity)', async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
  await ctx.post('/api/test/login', { data: { username: 'admin' } });
  const res = await ctx.get(`${BASE_URL}/admin/payments?week=${weekId}`, { headers: RSC_HEADERS });
  expect(res.status()).toBe(200);
  const edit = await ctx.get(`${BASE_URL}/admin/picks/${victimId}?week=${weekId}`, { headers: RSC_HEADERS });
  expect(await edit.text()).toContain(USERNAME);
  await ctx.dispose();
});
