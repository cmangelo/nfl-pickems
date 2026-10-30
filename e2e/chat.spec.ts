import { expect, test, type Page } from '@playwright/test';
import { createUser, loginAs, postChat, resetDb, setNow } from './helpers';

// Sun Oct 25 2026, 1:00 PM PT. Messages are posted with explicit `at`s relative to it.
const T = '2026-10-25T20:00:00Z';
const ago = (minutes: number) => new Date(Date.parse(T) - minutes * 60_000).toISOString();
const DAY = 24 * 60;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

const messages = (page: Page) => page.getByTestId('chat-message');
const input = (page: Page) => page.getByTestId('chat-input');
const chatTab = (page: Page) => page.getByTestId('bottom-nav').getByRole('link', { name: /^Chat/ });

async function openChat(page: Page, username = 'admin') {
  await setNow(page.context(), T);
  await loginAs(page, username);
  await page.goto('/chat');
  await expect(page.getByTestId('chat-room')).toBeVisible();
}

test('@smoke empty room: title instead of the week picker, empty state, Send disabled, composer above the tab bar', async ({ page }) => {
  await openChat(page);
  await expect(page.getByTestId('page-title')).toHaveText('Chat');
  await expect(page.getByTestId('week-picker')).toHaveCount(0);
  await expect(page.getByTestId('chat-empty')).toHaveText('No messages yet. Start the trash talk.');
  await expect(page.getByTestId('chat-load-older')).toHaveCount(0);
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await input(page).fill('   ');
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await expect(chatTab(page)).toHaveAttribute('aria-current', 'page');

  // The composer sits fully above the floating tab bar, and the page itself doesn't scroll.
  const composer = (await page.getByTestId('chat-send').boundingBox())!;
  const nav = (await page.getByTestId('bottom-nav').boundingBox())!;
  expect(composer.y + composer.height).toBeLessThanOrEqual(nav.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('@smoke send: Enter sends, Shift+Enter is a newline; own bubble on the right with time; input cleared', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'You guys are going down', { at: ago(5) });
  await openChat(page);

  const theirs = messages(page).first();
  await expect(theirs).toHaveAttribute('data-own', 'false');
  await expect(theirs.getByTestId('chat-username')).toHaveText('bobby');
  await expect(theirs.getByTestId('chat-time')).toHaveText('12:55 PM');
  await expect(page.getByTestId('chat-day')).toHaveText(['Sun, Oct 25']);

  await input(page).click();
  await page.keyboard.type('line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('line two');
  await expect(input(page)).toHaveValue('line one\nline two');
  await expect(messages(page)).toHaveCount(1); // Shift+Enter didn't send
  await page.keyboard.press('Enter');

  await expect(messages(page)).toHaveCount(2);
  const mine = messages(page).last();
  await expect(mine).toHaveAttribute('data-own', 'true');
  await expect(mine).toHaveAttribute('data-username', 'admin');
  expect(await mine.getByTestId('chat-body').textContent()).toBe('line one\nline two');
  await expect(mine.getByTestId('chat-time')).toHaveText('1:00 PM');
  await expect(mine.getByTestId('chat-username')).toHaveCount(0); // no name over your own bubbles
  await expect(input(page)).toHaveValue('');
  await expect(input(page)).toBeFocused();

  // Own bubble hugs the right edge with the accent fill; others' hug the left.
  const area = (await page.getByTestId('chat-scroll').boundingBox())!;
  const mineBox = (await mine.getByTestId('chat-body').boundingBox())!;
  const theirsBox = (await theirs.getByTestId('chat-body').boundingBox())!;
  expect(area.x + area.width - (mineBox.x + mineBox.width)).toBeLessThanOrEqual(2);
  expect(theirsBox.x - area.x).toBeLessThanOrEqual(2);
  const fills = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--accent)';
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return accent;
  });
  await expect(mine.getByTestId('chat-body')).toHaveCSS('background-color', fills);

  // Persisted: still there after a reload.
  await page.reload();
  await expect(messages(page)).toHaveCount(2);
  await expect(messages(page).last().getByTestId('chat-body')).toHaveText('line one\nline two');
});

test("another player's message shows up by polling, without a reload, and is marked read", async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'warmup', { at: ago(10) });
  await openChat(page);
  await expect(messages(page)).toHaveCount(1);

  await postChat(request, 'bobby', 'Chiefs by 20, write it down', { at: ago(1) });
  const fresh = messages(page).filter({ hasText: 'Chiefs by 20' });
  await expect(fresh).toBeVisible({ timeout: 8_000 }); // one 4 s poll
  await expect(fresh).toBeInViewport(); // was at the bottom: auto-scrolled
  await expect(page.getByTestId('chat-new-pill')).toHaveCount(0);

  // Read while on /chat: leaving shows no badge.
  await page.waitForTimeout(500); // let markReadAction land
  await page.getByTestId('bottom-nav').getByRole('link', { name: 'Games' }).click();
  await expect(page).toHaveURL(/\/games/);
  await expect(page.getByTestId('chat-badge')).toHaveCount(0);
});

test('scrolled up: a new message shows the "New messages" pill, which scrolls down', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'old', { at: ago(60), count: 30 });
  await openChat(page);
  await expect(messages(page).last()).toBeInViewport();
  await page.getByTestId('chat-scroll').evaluate((el) => (el.scrollTop = 0));

  await postChat(request, 'bobby', 'look at this', { at: ago(1) });
  await expect(page.getByTestId('chat-new-pill')).toBeVisible({ timeout: 8_000 });
  const fresh = messages(page).filter({ hasText: 'look at this' });
  await expect(fresh).not.toBeInViewport();
  await page.getByTestId('chat-new-pill').click();
  await expect(fresh).toBeInViewport();
  await expect(page.getByTestId('chat-new-pill')).toHaveCount(0);
});

test('"Load older" pages back 50 at a time, keeps the scroll position, then disappears', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'msg', { at: ago(120), count: 60 });
  await openChat(page);

  await expect(messages(page)).toHaveCount(50);
  await expect(messages(page).first().getByTestId('chat-body')).toHaveText('msg 11');
  await expect(messages(page).last().getByTestId('chat-body')).toHaveText('msg 60');
  await expect(messages(page).last()).toBeInViewport(); // starts at the bottom

  const scroll = page.getByTestId('chat-scroll');
  await scroll.evaluate((el) => (el.scrollTop = 0));
  // The bubble, not the row: msg 11 loses its username header once bobby's earlier messages are above it.
  const anchor = messages(page).getByTestId('chat-body').getByText('msg 11', { exact: true });
  const before = (await anchor.boundingBox())!.y;
  await page.getByTestId('chat-load-older').click();

  await expect(messages(page)).toHaveCount(60);
  await expect(messages(page).first().getByTestId('chat-body')).toHaveText('msg 1');
  await expect(page.getByTestId('chat-load-older')).toHaveCount(0);
  const after = (await anchor.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2); // prepended above: the view didn't jump
});

test('messages older than 30 days are not shown', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'ancient history', { at: ago(31 * DAY) });
  await postChat(request, 'bobby', 'still here', { at: ago(29 * DAY) });
  await openChat(page);
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first().getByTestId('chat-body')).toHaveText('still here');
  await expect(page.getByTestId('chat-day')).toHaveText(['Sat, Sep 26']);
  await expect(page.getByText('ancient history')).toHaveCount(0);
});

test("unread badge: others' messages count, 9+ cap, own messages don't count, visiting /chat clears it", async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await setNow(page.context(), T);
  await loginAs(page, 'admin');
  await postChat(request, 'admin', 'my own', { at: ago(30) });
  await page.goto('/picks');
  await expect(chatTab(page)).toBeVisible();
  await expect(page.getByTestId('chat-badge')).toHaveCount(0); // own messages don't count

  await postChat(request, 'bobby', 'hey', { at: ago(20), count: 3 });
  await page.goto('/picks');
  await expect(page.getByTestId('chat-badge')).toHaveText('3');
  await expect(chatTab(page)).toHaveAccessibleName('Chat, 3 unread');

  // Client navigation refreshes it.
  await postChat(request, 'bobby', 'more', { at: ago(10), count: 10 });
  await page.getByTestId('bottom-nav').getByRole('link', { name: 'Games' }).click();
  await expect(page).toHaveURL(/\/games/);
  await expect(page.getByTestId('chat-badge')).toHaveText('9+');
  await expect(chatTab(page)).toHaveAccessibleName('Chat, 9+ unread');

  // On /chat the badge is hidden; everything is read afterwards.
  await chatTab(page).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(messages(page)).toHaveCount(14);
  await expect(page.getByTestId('chat-badge')).toHaveCount(0);
  await expect(chatTab(page)).toHaveAccessibleName('Chat');
  await page.getByTestId('bottom-nav').getByRole('link', { name: 'My Picks' }).click();
  await expect(page).toHaveURL(/\/picks/);
  await expect(page.getByTestId('chat-badge')).toHaveCount(0);
  await page.reload();
  await expect(chatTab(page)).toBeVisible();
  await expect(page.getByTestId('chat-badge')).toHaveCount(0);
});

test('unread badge polls every 30 s without navigating', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await page.clock.install();
  await setNow(page.context(), T);
  await loginAs(page, 'admin');
  await page.goto('/picks');
  await expect(chatTab(page)).toBeVisible();
  await expect(page.getByTestId('chat-badge')).toHaveCount(0);

  await postChat(request, 'bobby', 'psst', { at: ago(1), count: 2 });
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId('chat-badge')).toHaveCount(0); // not polled yet
  await page.clock.fastForward(21_000);
  await expect(page.getByTestId('chat-badge')).toHaveText('2');
});

test('too long: the counter appears near the limit, goes negative, and the message can’t be sent', async ({ page }) => {
  await openChat(page);
  await expect(page.getByTestId('chat-counter')).toHaveCount(0);
  await input(page).fill('x'.repeat(460));
  await expect(page.getByTestId('chat-counter')).toHaveText('40');
  await expect(page.getByTestId('chat-send')).toBeEnabled();

  await input(page).fill('x'.repeat(510));
  await expect(page.getByTestId('chat-counter')).toHaveText('-10');
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await input(page).press('Enter');
  await expect(page.getByTestId('chat-error')).toHaveText('Messages can be at most 500 characters.');
  await expect(messages(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue('x'.repeat(510)); // kept, so it can be trimmed

  // Exactly 500 goes through.
  await input(page).fill('y'.repeat(500));
  await expect(page.getByTestId('chat-error')).toHaveCount(0);
  await expect(page.getByTestId('chat-counter')).toHaveText('0');
  await page.getByTestId('chat-send').click();
  await expect(messages(page)).toHaveCount(1);
});

test('long words wrap inside the bubble (no horizontal scroll)', async ({ page, request }) => {
  await createUser(request, 'Bob', 'bobby');
  await postChat(request, 'bobby', 'A'.repeat(300), { at: ago(2) });
  await postChat(request, 'bobby', 'https://example.com/' + 'b'.repeat(200), { at: ago(1) });
  await openChat(page);
  await expect(messages(page)).toHaveCount(2);
  const scroll = page.getByTestId('chat-scroll');
  const widths = await scroll.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(page_).toBeLessThanOrEqual(0);
});

test('the tab bar fits Chat at phone width: 5 tabs for admins, 4 for players, labels not clipped', async ({ page, request, context }) => {
  await createUser(request, 'Bob', 'bobby');
  for (const [user, tabs] of [
    ['admin', ['My Picks', 'Leaderboard', 'Games', 'Chat', 'Admin']],
    ['bobby', ['My Picks', 'Leaderboard', 'Games', 'Chat']],
  ] as const) {
    await context.clearCookies();
    await loginAs(page, user);
    await page.goto('/picks');
    const links = page.getByTestId('bottom-nav').getByRole('link');
    await expect(links).toHaveText([...tabs]);
    const clipped = await links.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
    expect(clipped).toEqual([]);
  }
});

test('?week= is kept on the Chat tab link like the others', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/picks?week=123');
  await expect(chatTab(page)).toHaveAttribute('href', '/chat?week=123');
});

test('logged out: the chat API answers 401 and /chat redirects to login', async ({ page, request }) => {
  expect((await request.get('/api/chat')).status()).toBe(401);
  expect((await request.get('/api/chat?after=0')).status()).toBe(401);
  expect((await request.get('/api/chat/unread')).status()).toBe(401);
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/login$/);
});
