import { expect, test } from '@playwright/test';
import { clearNow, loginAs, resetDb, seedWeek, setNow, setResult } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('@smoke login page renders with username and PIN fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /pick.?em/i })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByLabel('4-digit PIN')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('@smoke / redirects to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('login page has no horizontal overflow on mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/login');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('@smoke theme uses the dark background and mono accent tokens', async ({ page }) => {
  await page.goto('/login');
  const vars = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { bg: s.getPropertyValue('--bg').trim(), accent: s.getPropertyValue('--accent').trim() };
  });
  expect(vars).toEqual({ bg: '#0f1115', accent: '#f2f2f7' });
});

test('@smoke time control: setNow is reflected by now()', async ({ page, context }) => {
  await setNow(context, '2026-10-07T20:00:00.000Z');
  const res = await page.request.get('/api/test/now');
  expect((await res.json()).now).toBe('2026-10-07T20:00:00.000Z');

  await setNow(context, '2026-10-09T20:00:00.000Z');
  expect((await (await page.request.get('/api/test/now')).json()).now).toBe('2026-10-09T20:00:00.000Z');

  await clearNow(context);
  const real = new Date((await (await page.request.get('/api/test/now')).json()).now).getFullYear();
  expect(real).toBeGreaterThanOrEqual(2025);
});

test('header override also works', async ({ request }) => {
  const res = await request.get('/api/test/now', { headers: { 'x-test-now': '2026-01-01T00:00:00.000Z' } });
  expect((await res.json()).now).toBe('2026-01-01T00:00:00.000Z');
});

test('test helpers: seed a week, set a result, log in', async ({ page, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { numGames: 4, tuesday: '2026-10-07T20:00:00Z' });
  expect(weekId).toBeGreaterThan(0);
  expect(gameIds).toHaveLength(4);
  await setResult(request, gameIds[0], 'home');
  await loginAs(page, 'admin');
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'session')).toBe(true);
});
