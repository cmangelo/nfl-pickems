import { expect, test } from '@playwright/test';
import { loginAs, resetDb } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

const EXPECTED: Record<string, string> = {
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
};

test('@smoke security headers on pages, redirects, 404s and API routes', async ({ page, request }) => {
  const responses = [
    await request.get('/login'),
    await request.get('/picks', { maxRedirects: 0 }),
    await request.get('/does-not-exist'),
    await request.get('/api/cron/sync'),
  ];
  for (const res of responses) {
    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(res.headers()[name], `${res.url()} ${name}`).toBe(value);
    }
  }

  await loginAs(page, 'admin');
  const res = await page.goto('/picks');
  for (const [name, value] of Object.entries(EXPECTED)) expect(res?.headers()[name], name).toBe(value);
});
