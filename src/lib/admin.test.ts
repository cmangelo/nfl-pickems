import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, games, picks, sessions, users } from '@/db/schema';
import { fromPtInputValue, listUsers, removeUser, resetPin, setAdmin, setPaid, toPtInputValue } from './admin';
import { createSession } from './auth';
import { verifyPin } from './pin';
import { freshDb, makeEntry, makeUser, makeWeek } from './testing/helpers';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);

describe('PT datetime-local conversion', () => {
  it('converts PDT and PST wall times to UTC', () => {
    expect(fromPtInputValue('2026-10-08T12:00')).toEqual(d('2026-10-08T19:00:00Z'));
    expect(fromPtInputValue('2026-12-10T12:00')).toEqual(d('2026-12-10T20:00:00Z'));
  });
  it('round-trips', () => {
    for (const s of ['2026-10-08T12:00', '2026-11-26T09:30', '2026-03-08T03:15']) {
      expect(toPtInputValue(fromPtInputValue(s)!)).toBe(s);
    }
  });
  it('rejects garbage', () => {
    expect(fromPtInputValue('')).toBeNull();
    expect(fromPtInputValue('2026-13-01T10:00')).toBeNull();
    expect(fromPtInputValue('nope')).toBeNull();
  });
});

describe('admin user/payment logic', () => {
  let weekId: number;
  let gameIds: number[];
  beforeEach(async () => {
    await freshDb();
    const w = await makeWeek({ unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') }, [{}, {}]);
    weekId = w.week.id;
    gameIds = w.games.map((g) => g.id);
  });

  it('setPaid toggles one entry and reports a missing entry', async () => {
    const u = await makeUser('Ann');
    expect(await setPaid(9999, true)).toBe(false);
    const e1 = await makeEntry(u.id, weekId, 40, false, {});
    const e2 = await makeEntry(u.id, weekId, 41, false, {}, 2);
    expect(await setPaid(e2.id, true)).toBe(true);
    const db = await getDb();
    const paidOf = async () => Object.fromEntries((await db.select().from(entries)).map((e) => [e.id, e.paid]));
    expect(await paidOf()).toEqual({ [e1.id]: false, [e2.id]: true });
    await setPaid(e1.id, true);
    await setPaid(e2.id, false);
    expect(await paidOf()).toEqual({ [e1.id]: true, [e2.id]: false });
  });

  it('resetPin validates, sets the hash and clears lockout', async () => {
    const u = await makeUser('Ann');
    const db = await getDb();
    await db.update(users).set({ failedAttempts: 3, lockedUntil: d('2030-01-01T00:00:00Z') }).where(eq(users.id, u.id));
    expect((await resetPin(u.id, '12')).ok).toBe(false);
    expect((await resetPin(999, '1234')).ok).toBe(false);
    expect((await resetPin(u.id, '4321')).ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(await verifyPin('4321', row.pinHash)).toBe(true);
    expect(row.failedAttempts).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });

  it('setAdmin blocks self changes', async () => {
    const a = await makeUser('Ann');
    const b = await makeUser('Bob');
    expect((await setAdmin(a.id, a.id, false)).ok).toBe(false);
    expect((await setAdmin(a.id, b.id, true)).ok).toBe(true);
    const db = await getDb();
    expect((await db.select().from(users).where(eq(users.id, b.id)))[0].isAdmin).toBe(true);
    expect((await setAdmin(a.id, b.id, false)).ok).toBe(true);
    expect((await setAdmin(a.id, 999, true)).ok).toBe(false);
  });

  it('removeUser soft-deletes: keeps past entries, drops the open-week entry, ends sessions, reserves the username', async () => {
    const a = await makeUser('Ann');
    const b = await makeUser('Bob');
    const c = await makeUser('Cy');
    const db = await getDb();
    // A past (final) week where Bob played, plus the open week (weekId) where Bob and Cy entered.
    const past = await makeWeek(
      { weekNumber: 4, unlockAt: d('2026-09-29T07:00:00Z'), lockAt: d('2026-10-01T19:00:00Z') },
      [{ status: 'final', winner: 'home', homeScore: 3, awayScore: 0 }],
    );
    await makeEntry(b.id, past.week.id, 30, true, { [past.games[0].id]: 'home' });
    const pm = { [gameIds[0]]: 'home', [gameIds[1]]: 'away' } as const;
    await makeEntry(b.id, weekId, 40, false, pm);
    await makeEntry(c.id, weekId, 41, false, pm);
    await createSession(b.id);
    const NOW = d('2026-10-07T12:00:00Z'); // week 5 is open
    expect((await removeUser(a.id, a.id, NOW)).ok).toBe(false);
    expect((await removeUser(a.id, b.id, NOW)).ok).toBe(true);
    expect((await removeUser(a.id, b.id, NOW)).ok).toBe(false); // already removed
    expect((await removeUser(a.id, 999, NOW)).ok).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, b.id));
    expect(row.deactivatedAt).toEqual(NOW);
    expect(row.username).toBe('bob'); // still reserved
    expect(await db.select().from(sessions)).toHaveLength(0);
    // Open-week entry (and its picks) gone; past-week entry and picks untouched; Cy untouched.
    const all = await db.select().from(entries);
    expect(all.map((e) => [e.userId, e.weekId]).sort()).toEqual([[b.id, past.week.id], [c.id, weekId]].sort());
    expect(await db.select().from(picks)).toHaveLength(3);
    expect(await db.select().from(games)).toHaveLength(3);
    expect((await listUsers()).map((u) => u.firstName)).toEqual(['Ann', 'Cy']);
    expect((await listUsers({ includeDeactivated: true })).map((u) => u.firstName)).toEqual(['Ann', 'Bob', 'Cy']);
  });

  it('removeUser leaves a locked week entry alone', async () => {
    const a = await makeUser('Ann');
    const b = await makeUser('Bob');
    await makeEntry(b.id, weekId, 40, false, { [gameIds[0]]: 'home', [gameIds[1]]: 'away' });
    expect((await removeUser(a.id, b.id, d('2026-10-09T12:00:00Z'))).ok).toBe(true); // after the lock
    const db = await getDb();
    expect(await db.select().from(entries)).toHaveLength(1);
  });
});
