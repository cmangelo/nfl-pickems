import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DB_DRIVER = 'memory';

let clock = new Date('2026-10-07T20:00:00Z');
vi.mock('@/lib/time', () => ({ now: async () => clock, isTestMode: () => false }));
vi.mock('./pin', async (orig) => {
  const real = await orig<typeof import('./pin')>();
  return { ...real, verifyPin: vi.fn(real.verifyPin) };
});

type Auth = typeof import('./auth');
let auth: Auth;
let dbMod: typeof import('@/db');
let schema: typeof import('@/db/schema');
let pinMod: typeof import('./pin');

beforeAll(async () => {
  auth = await import('./auth');
  dbMod = await import('@/db');
  schema = await import('@/db/schema');
  pinMod = await import('./pin');
});

beforeEach(async () => {
  clock = new Date('2026-10-07T20:00:00Z');
  vi.mocked(pinMod.verifyPin).mockClear();
  await dbMod.resetDb();
});

const minutes = (n: number) => new Date(new Date('2026-10-07T20:00:00Z').getTime() + n * 60000);

async function userRow(username: string) {
  const db = await dbMod.getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  return row;
}

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
    clock = minutes(16);
    expect((await auth.login('dan', '1234')).ok).toBe(true);
  });

  it('a success resets the failure counter', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 4; i++) await auth.login('dan', '0000');
    expect((await auth.login('dan', '1234')).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect((await auth.login('dan', '0000')).ok).toBe(false);
    expect((await auth.login('dan', '1234')).ok).toBe(true); // 4 more fails did not lock
  });

  it('an expired lock does not reset the counter: the next lock comes after 5 more failures and lasts twice as long', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 5; i++) await auth.login('dan', '0000');
    clock = minutes(16);
    for (let i = 0; i < 4; i++) expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Wrong username or PIN.' });
    expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Too many attempts. Try again in 30 min.' });
    expect(await auth.login('dan', '1234')).toEqual({ ok: false, error: 'Too many attempts. Try again in 30 min.' });
    clock = minutes(16 + 31);
    expect((await auth.login('dan', '1234')).ok).toBe(true);
  });

  it('a correct PIN after an expired lock logs in and resets the counter and lock', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 5; i++) await auth.login('dan', '0000');
    clock = minutes(16);
    expect((await auth.login('dan', '1234')).ok).toBe(true);
    expect(await userRow('dan')).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    // back to the first-lockout duration
    for (let i = 0; i < 4; i++) await auth.login('dan', '0000');
    expect(await auth.login('dan', '0000')).toEqual({ ok: false, error: 'Too many attempts. Try again in 15 min.' });
  });

  it('lock durations escalate 15 min, 30 min, 1 hr, 2 hr ... and cap at 24 hr', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    const mins = [15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440];
    for (let round = 0; round < mins.length; round++) {
      const t0 = clock.getTime();
      for (let i = 0; i < 4; i++) expect((await auth.login('dan', '0000')).ok).toBe(false);
      const res = await auth.login('dan', '0000');
      expect(res.ok).toBe(false);
      const row = await userRow('dan');
      expect(row.lockedUntil?.getTime(), `round ${round}`).toBe(t0 + mins[round] * 60000);
      expect(res).toEqual({
        ok: false,
        error: `Too many attempts. Try again in ${mins[round] >= 60 ? `${mins[round] / 60} hr` : `${mins[round]} min`}.`,
      });
      clock = new Date(t0 + (mins[round] + 1) * 60000);
    }
  });

  it('lockoutMinutes and formatLockMessage', () => {
    expect([5, 10, 15, 20, 25, 30, 35, 40, 45, 5000].map(auth.lockoutMinutes)).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440]);
    expect(auth.formatLockMessage(0.2)).toBe('Too many attempts. Try again in 1 min.');
    expect(auth.formatLockMessage(59)).toBe('Too many attempts. Try again in 59 min.');
    expect(auth.formatLockMessage(60)).toBe('Too many attempts. Try again in 1 hr.');
    expect(auth.formatLockMessage(121)).toBe('Too many attempts. Try again in 3 hr.');
  });

  it('200 parallel wrong guesses: at most 5 reach scrypt, the account ends locked', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    const verify = vi.mocked(pinMod.verifyPin);
    verify.mockClear();
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => auth.login('dan', String(i % 9).repeat(4))));
    expect(verify.mock.calls.length).toBe(5);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results.filter((r) => !r.ok && r.error.startsWith('Too many attempts')).length).toBeGreaterThanOrEqual(195);
    const row = await userRow('dan');
    expect(row.failedAttempts).toBe(5);
    expect(row.lockedUntil?.getTime()).toBe(minutes(15).getTime());
  });

  it('a correct PIN in a parallel batch after the 5th failure is rejected', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    for (let i = 0; i < 4; i++) await auth.login('dan', '0000');
    const results = await Promise.all([
      auth.login('dan', '0000'), // the 5th failure
      ...Array.from({ length: 20 }, () => auth.login('dan', '1234')), // the real PIN, in flight at the same time
    ]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(await userRow('dan')).toMatchObject({ failedAttempts: 5 });
    expect(await auth.login('dan', '1234')).toEqual({ ok: false, error: 'Too many attempts. Try again in 15 min.' });
  });

  it('parallel guesses do not run scrypt while locked, and escalation holds across waves', async () => {
    await auth.signUp('Dan', 'dan', '1234');
    await Promise.all(Array.from({ length: 50 }, () => auth.login('dan', '0000')));
    clock = minutes(16);
    const verify = vi.mocked(pinMod.verifyPin);
    verify.mockClear();
    await Promise.all(Array.from({ length: 50 }, () => auth.login('dan', '0000')));
    expect(verify.mock.calls.length).toBe(5);
    const row = await userRow('dan');
    expect(row.failedAttempts).toBe(10);
    expect(row.lockedUntil?.getTime()).toBe(minutes(16 + 30).getTime());
  });

  it('unknown usernames still run a scrypt verify (equal timing) and give the generic error', async () => {
    const verify = vi.mocked(pinMod.verifyPin);
    verify.mockClear();
    expect(await auth.login('nobody', '1234')).toEqual({ ok: false, error: 'Wrong username or PIN.' });
    expect(verify).toHaveBeenCalledTimes(1);
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

describe('deactivated users', () => {
  it('cannot log in, even with the right PIN, and get the generic error', async () => {
    const res = await auth.signUp('Gone', 'gone_user', '4821');
    expect(res.ok).toBe(true);
    const db = await dbMod.getDb();
    await db.update(schema.users).set({ deactivatedAt: new Date() }).where(eq(schema.users.username, 'gone_user'));
    const login = await auth.login('gone_user', '4821');
    expect(login).toEqual({ ok: false, error: 'Wrong username or PIN.' });
  });
});
