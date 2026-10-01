import { expect, test, type Page } from '@playwright/test';
import { loginAs, loginViaUi, logoutViaUi, resetDb, setNow, signUpViaUi } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

/** Click a submit button and wait for the server action response (avoids reading a stale error). */
async function submit(page: Page, name: string) {
  const done = page.waitForResponse((r) => r.request().method() === 'POST');
  await page.getByRole('button', { name }).click();
  await done;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('@smoke sign up lands on /picks with nav; logout returns to /login', async ({ page }) => {
  await signUpViaUi(page, 'Dan', 'Dan_Man', '4321');
  await expect(page.getByRole('heading', { name: 'My Picks' })).toBeVisible();
  for (const name of ['My Picks', 'Leaderboard', 'Games']) {
    await expect(nav(page).getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByTestId('avatar-button')).toHaveText('D');
  await expect(page.getByRole('link', { name: /Week \d+, change week/ })).toBeVisible();

  // stays logged in: / and /login both go to the app
  await page.goto('/');
  await expect(page).toHaveURL(/\/picks$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/picks$/);

  await logoutViaUi(page);
  await page.goto('/picks');
  await expect(page).toHaveURL(/\/login$/);
});

test('@smoke logged-out visit to a protected page redirects to login', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('sign up validation errors show inline; duplicate username rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await page.getByLabel('First name').fill('Dan');
  await page.getByLabel('Username').fill('ab');
  await page.getByLabel('4-digit PIN').fill('1234');
  await submit(page, 'Create account');
  await expect(page.getByTestId('auth-error')).toContainText('Username must be 3 to 20');
  // field values survive the error
  await expect(page.getByLabel('First name')).toHaveValue('Dan');

  await page.getByLabel('Username').fill('ADMIN');
  await page.getByLabel('4-digit PIN').fill('1234'); // PIN is cleared after an error
  await submit(page, 'Create account');
  await expect(page.getByTestId('auth-error')).toHaveText('That username is taken.');
});

test('login page layout: toggle, copy, no overflow', async ({ page, isMobile }) => {
  await page.goto('/login');
  await expect(page.getByText('Forgot your PIN? Ask an admin to reset it.')).toBeVisible();
  await expect(page.getByText("You'll stay logged in on this phone.")).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await expect(page.getByLabel('First name')).toBeVisible();
  await expect(page.getByLabel('4-digit PIN')).toHaveAttribute('maxlength', '4');
  await expect(page.getByLabel('4-digit PIN')).toHaveAttribute('inputmode', 'numeric');
  if (isMobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
});

test('wrong PIN shows an error; 5 wrong PINs lock; unlocks after 15 min', async ({ page, context }) => {
  await setNow(context, '2026-10-07T20:00:00Z');
  await signUpViaUi(page, 'Sam', 'sam', '1111');
  await logoutViaUi(page);

  await loginViaUi(page, 'sam', '0000');
  await expect(page.getByTestId('auth-error')).toHaveText('Wrong username or PIN.');
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('4-digit PIN').fill('0000');
    await submit(page, 'Log in');
    await expect(page.getByTestId('auth-error')).toHaveText('Wrong username or PIN.');
  }
  await page.getByLabel('4-digit PIN').fill('0000');
  await submit(page, 'Log in');
  await expect(page.getByTestId('auth-error')).toContainText('Too many attempts. Try again in 15 min.');

  // even the right PIN is rejected while locked
  await page.getByLabel('4-digit PIN').fill('1111');
  await submit(page, 'Log in');
  await expect(page.getByTestId('auth-error')).toContainText('Too many attempts');
  await expect(page).toHaveURL(/\/login$/);

  await setNow(context, '2026-10-07T20:16:00Z');
  await page.getByLabel('4-digit PIN').fill('1111');
  await submit(page, 'Log in');
  await expect(page).toHaveURL(/\/picks$/);
});

test('non-admin has no Admin tab and /admin is blocked', async ({ page }) => {
  await signUpViaUi(page, 'Dan', 'dan', '1234');
  await expect(nav(page).getByRole('link', { name: 'Admin' })).toHaveCount(0);
  const res = await page.goto('/admin');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
});

test('admin sees the Admin tab and can open it', async ({ page, context }) => {
  await loginAs(context, 'admin');
  await page.goto('/picks');
  await nav(page).getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
});

test('admin can log in through the UI with the seeded credentials', async ({ page }) => {
  await loginViaUi(page, 'admin', '1234');
  await expect(page).toHaveURL(/\/picks$/);
  await expect(nav(page).getByRole('link', { name: 'Admin' })).toBeVisible();
});

test('change PIN, then log in with the new PIN', async ({ page }) => {
  await signUpViaUi(page, 'Dan', 'dan', '1234');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Change PIN' }).click();
  await expect(page).toHaveURL(/\/account\/pin$/);

  await page.getByLabel('Current PIN').fill('9999');
  await page.getByLabel('New PIN', { exact: true }).fill('5678');
  await page.getByLabel('Confirm new PIN').fill('5678');
  await submit(page, 'Update PIN');
  await expect(page.getByTestId('pin-error')).toHaveText('Current PIN is incorrect.');

  await page.getByLabel('Current PIN').fill('1234');
  await page.getByLabel('New PIN', { exact: true }).fill('5678');
  await page.getByLabel('Confirm new PIN').fill('5600');
  await submit(page, 'Update PIN');
  await expect(page.getByTestId('pin-error')).toHaveText('New PINs do not match.');

  await page.getByLabel('Current PIN').fill('1234');
  await page.getByLabel('New PIN', { exact: true }).fill('5678');
  await page.getByLabel('Confirm new PIN').fill('5678');
  await submit(page, 'Update PIN');
  await expect(page.getByTestId('pin-success')).toBeVisible();

  await logoutViaUi(page);
  await loginViaUi(page, 'dan', '1234');
  await expect(page.getByTestId('auth-error')).toHaveText('Wrong username or PIN.');
  await page.getByLabel('4-digit PIN').fill('5678');
  await submit(page, 'Log in');
  await expect(page).toHaveURL(/\/picks$/);
});
