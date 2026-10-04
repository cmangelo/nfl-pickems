import { expect, test, type Page } from '@playwright/test';
import { createUser, loginAs, resetDb, seedWeek, setNow, submitPicksFor } from './helpers';

const WED = '2026-10-07T20:00:00Z'; // week locks Thu Oct 8 12:00 PM PT

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

/** Waits until the form has written its draft (or, with `present = false`, removed every draft). */
async function waitForDraft(page: Page, present = true) {
  await page.waitForFunction(
    (want) => Object.keys(localStorage).some((k) => k.startsWith('pickems:draft:')) === want,
    present,
  );
}

test('@smoke unfinished picks come back automatically after leaving; Clear picks wipes them', async ({ page, context, request }) => {
  const { gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 4, tuesday: WED });
  await createUser(request, 'Ann', 'annie');
  await setNow(context, WED);
  await loginAs(page, 'annie');
  await page.goto('/picks');
  await expect(page.getByTestId('reset-picks')).toHaveCount(0);

  await page.getByTestId(`pick-${gameIds[0]}-home`).click();
  await page.getByTestId(`pick-${gameIds[1]}-away`).click();
  await waitForDraft(page);
  await page.reload();

  // Filled back in automatically, clearly not submitted.
  await expect(page.getByTestId('progress')).toHaveText('2/4 picked');
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('draft-restored')).toContainText("They aren't submitted yet.");

  // Clear picks needs a second tap.
  const reset = page.getByTestId('reset-picks');
  await expect(reset).toHaveText('Clear picks');
  await reset.click();
  await expect(reset).toHaveText('Tap again to clear');
  await expect(page.getByTestId('progress')).toHaveText('2/4 picked');
  await reset.click();
  await expect(page.getByTestId('progress')).toHaveText('0/4 picked');
  await expect(page.getByTestId('reset-picks')).toHaveCount(0);
  await expect(page.getByTestId('draft-restored')).toHaveCount(0);
  await waitForDraft(page, false);

  // Finish and submit: the draft is gone and the saved picks load from the server.
  for (const id of gameIds) await page.getByTestId(`pick-${id}-home`).click();
  await page.getByLabel(/Total points in/).fill('45');
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await expect(page.getByText('Picks saved.')).toBeVisible();
  await waitForDraft(page, false);
  await page.reload();
  await expect(page.getByTestId('draft-restored')).toHaveCount(0);
  await expect(page.getByTestId('reset-picks')).toHaveCount(0);
  await expect(page.getByTestId('progress')).toHaveText('4/4 picked');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('45');
});

test('unsaved changes to submitted picks come back marked unsaved; Undo changes restores the submitted picks', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'annie');
  await submitPicksFor(request, 'annie', weekId, ['home', 'home'], 40);
  await setNow(context, WED);
  await loginAs(page, 'annie');
  await page.goto('/picks');
  await expect(page.getByTestId('unsaved')).toHaveCount(0);

  await page.getByTestId(`pick-${gameIds[0]}-away`).click();
  await expect(page.getByTestId('unsaved')).toBeVisible();
  await waitForDraft(page);
  await page.reload();

  await expect(page.getByTestId(`pick-${gameIds[0]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('unsaved')).toHaveText('· unsaved changes');
  await expect(page.getByTestId('draft-restored')).toContainText('tap Update picks to keep them');
  await page.getByTestId('reset-picks').click(); // "Undo changes": one tap, nothing is lost
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  await waitForDraft(page, false);
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('draft-restored')).toHaveCount(0);

  // Restored changes are saved only by Update picks.
  await page.getByTestId(`pick-${gameIds[1]}-away`).click();
  await waitForDraft(page);
  await page.reload();
  await page.getByRole('button', { name: 'Update picks' }).click();
  await expect(page.getByText('Picks saved.')).toBeVisible();
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  await waitForDraft(page, false);
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');
});

test('a draft is dropped once the entry was saved elsewhere (another device or an admin)', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'annie');
  await submitPicksFor(request, 'annie', weekId, ['home', 'home'], 40);
  await setNow(context, WED);
  await loginAs(page, 'annie');
  await page.goto('/picks');

  await page.getByTestId(`pick-${gameIds[0]}-away`).click();
  await waitForDraft(page);
  await submitPicksFor(request, 'annie', weekId, ['home', 'away'], 52); // saved on another device
  await page.reload();

  await expect(page.getByTestId('draft-restored')).toHaveCount(0);
  await expect(page.getByTestId(`pick-${gameIds[0]}-home`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`pick-${gameIds[1]}-away`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/Total points in/)).toHaveValue('52');
  await waitForDraft(page, false);
});

test('drafts are per player and never kept on the admin edit-picks page', async ({ page, context, request }) => {
  const { weekId, gameIds } = await seedWeek(request, { weekNumber: 7, numGames: 2, tuesday: WED });
  await createUser(request, 'Ann', 'annie');
  await createUser(request, 'Bob', 'bobby');
  await setNow(context, WED);
  await loginAs(page, 'annie');
  await page.goto('/picks');
  await page.getByTestId(`pick-${gameIds[0]}-away`).click();
  await waitForDraft(page);

  // Same browser, another player: Ann's draft is not offered to Bob.
  await loginAs(page, 'bobby');
  await page.goto('/picks');
  await expect(page.getByTestId('progress')).toHaveText('0/2 picked');
  await expect(page.getByTestId('draft-restored')).toHaveCount(0);

  // Admin editing Ann's picks: no draft offered and none written.
  await page.evaluate(() => localStorage.clear());
  await loginAs(page, 'admin');
  await page.goto(`/admin/picks/2?week=${weekId}`);
  await expect(page.getByRole('heading', { name: /Edit picks: Ann/ })).toBeVisible();
  await page.getByTestId(`pick-${gameIds[1]}-home`).click();
  await page.reload();
  await expect(page.getByTestId(`pick-${gameIds[1]}-home`)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pickems:draft:')))).toEqual([]);
});
