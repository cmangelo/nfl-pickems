import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DB_DRIVER = 'memory';

let clock = new Date('2026-10-07T20:00:00Z');
vi.mock('@/lib/time', () => ({ now: async () => clock, isTestMode: () => false }));

type Auth = typeof import('./auth');
let auth: Auth;
let dbMod: typeof import('@/db');
let schema: typeof import('@/db/schema');

beforeAll(async () => {
  auth = await import('./auth');
  dbMod = await import('@/db');
  schema = await import('@/db/schema');
});

beforeEach(async () => {
  clock = new Date('2026-10-07T20:00:00Z');
  await dbMod.resetDb();
});

const minutes = (n: number) => new Date(clock.getTime() + n * 60000);

describe('signUp validation', () => {
  it('creates a user with lowercase username and trimmed name', async () => {
    const r = await auth.signUp('  Dan ', 'Dan_The_Man', '1234');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user).toMatchObject({ firstName: 'Dan', username: 'dan_the_man', isAdmin: false });
  });
  it('rejects bad first names', async () => {
    expect((await auth.signUp('   ', 'dan', '1234')).ok).toBe(false);
    expect((await auth.signUp('x'.repeat(31), 'dan', '1234')).ok).toBe(false);
    expect((await auth.signUp('x'.repeat(30), 'dan', '1234')).ok).toBe(true);
  });
  it('rejects bad usernames', async () => {
    for (const u of ['ab', 'a'.repeat(21), 'dan smith', 'dan-1', 'dán']) {
      expect((await auth.signUp('Dan', u, '1234')).ok, u).toBe(false);
    }
    expect((await auth.signUp('Dan', 'abc', '1234')).ok).toBe(true);
    expect((await auth.signUp('Dan', 'a'.repeat(20), '1234')).ok).toBe(true);
  });
  it('rejects bad PINs', async () => {
    for (const p of ['123', '12345', 'abcd', '12 4', '']) {
      expect((await auth.signUp('Dan', 'dan', p)).ok, p).toBe(false);
    }
  });
  it('usernames are case-insensitively unique', async () => {
    expect((await auth.signUp('A', 'Sam', '1234')).ok).toBe(true);
    const dup = await auth.signUp('B', 'sAM', '1234');
    expect(dup).toEqual({ ok: false, error: 'That username is taken.' });
  });
  it('stores a scrypt hash, not the PIN', async () => {
    const r = await auth.signUp('Dan', 'dan', '9876');
    if (!r.ok) throw new Error('signup failed');
    expect(r.user.pinHash.startsWith('scrypt$')).toBe(true);
    expect(r.user.pinHash).not.toContain('9876');
  });
});

describe('login and lockout', () => {
  it('logs in case-insensitively and rejects wrong PIN / unknown user', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    expect((await auth.login('DAN', '1234')).ok).toBe(true);
    expect((await auth.login('dan', '1111')).ok).toBe(false);
    expect((await auth.login('nobody', '1234')).ok).toBe(false);
  });

  it('locks after 5 failures, rejects the right PIN while locked, unlocks after 15 min', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 4; i++) {
      expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Wrong username or PIN.' });
    }
    expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Too many attempts. Try again in 15 min.' });
    const db = await dbMod.getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.username, 'dan'));
    expect(row.lockedUntil?.getTime()).toBe(minutes(15).getTime());

    expect(await auth.login('dan', '1234')).toEqual({ ok: false, error: 'Too many attempts. Try again in 15 min.' });
    clock = minutes(10);
    expect(await auth.login('dan', '1234')).toEqual({ ok: false, error: 'Too many attempts. Try again in 5 min.' });
    clock = minutes(6); // 16 min after the lock started
    expect((await auth.login('dan', '1234')).ok).toBe(true);
  });

  it('a success resets the failure counter', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 4; i++) await auth.login('dan', '0000');
    expect((await auth.login('dan', '1234')).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect((await auth.login('dan', '0000')).ok).toBe(false);
    expect((await auth.login('dan', '1234')).ok).toBe(true); // 4 more fails did not lock
  });

  it('after an expired lock, a wrong PIN counts as the first failure again', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 5; i++) await auth.login('dan', '0000');
    clock = minutes(16);
    for (let i = 0; i < 4; i++) expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Wrong username or PIN.' });
    expect((await auth.login('dan', '1234')).ok).toBe(true);
  });
});

describe('changePin', () => {
  it('changes the PIN when the current PIN is right', async () => {
    const r = await auth.signUp('Dan', 'dan', '1234');
    if (!r.ok) throw new Error('signup');
    expect(await auth.changePin(r.user, '1234', '5678')).toEqual({ ok: true });
    expect((await auth.login('dan', '1234')).ok).toBe(false);
    expect((await auth.login('dan', '5678')).ok).toBe(true);
  });
  it('rejects wrong current PIN and invalid new PIN', async () => {
    const r = await auth.signUp('Dan', 'dan', '1234');
    if (!r.ok) throw new Error('signup');
    expect((await auth.changePin(r.user, '0000', '5678')).ok).toBe(false);
    expect((await auth.changePin(r.user, '1234', '56')).ok).toBe(false);
    expect((await auth.login('dan', '1234')).ok).toBe(true);
  });
});

describe('sessions', () => {
  it('createSession stores a 32-byte hex token expiring in ~1 year', async () => {
    const r = await auth.signUp('Dan', 'dan', '1234');
    if (!r.ok) throw new Error('signup');
    const { token, expiresAt } = await auth.createSession(r.user.id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime() - clock.getTime()).toBeGreaterThan(360 * 24 * 3600 * 1000);
    const db = await dbMod.getDb();
    expect((await db.select().from(schema.sessions).where(eq(schema.sessions.id, token))).length).toBe(1);
  });
});
