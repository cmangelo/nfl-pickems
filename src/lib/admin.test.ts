import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, games, picks, sessions, users } from '@/db/schema';
import { fromPtInputValue, removeUser, resetPin, setAdmin, setPaid, toPtInputValue } from './admin';
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

  it('setPaid toggles an entry and reports a missing entry', async () => {
    const u = await makeUser('Ann');
    expect(await setPaid(u.id, weekId, true)).toBe(false);
    await makeEntry(u.id, weekId, 40, false, {});
    expect(await setPaid(u.id, weekId, true)).toBe(true);
    const db = await getDb();
    expect((await db.select().from(entries))[0].paid).toBe(true);
    await setPaid(u.id, weekId, false);
    expect((await db.select().from(entries))[0].paid).toBe(false);
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

  it('removeUser cascades sessions, entries and picks; blocks self', async () => {
    const a = await makeUser('Ann');
    const b = await makeUser('Bob');
    const c = await makeUser('Cy');
    const pm = { [gameIds[0]]: 'home', [gameIds[1]]: 'away' } as const;
    await makeEntry(b.id, weekId, 40, false, pm);
    await makeEntry(c.id, weekId, 41, false, pm);
    await createSession(b.id);
    expect((await removeUser(a.id, a.id)).ok).toBe(false);
    expect((await removeUser(a.id, b.id)).ok).toBe(true);
    expect((await removeUser(a.id, b.id)).ok).toBe(false);
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.id, b.id))).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await db.select().from(entries)).map((e) => e.userId)).toEqual([c.id]);
    expect(await db.select().from(picks)).toHaveLength(2);
    expect(await db.select().from(games)).toHaveLength(2);
  });
});
