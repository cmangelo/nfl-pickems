import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries } from '@/db/schema';
import { getEntry, listEntries, submitPicks } from './picks';
import { freshDb, makeUser, makeWeek } from './testing/helpers';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);
const W = { weekNumber: 5, unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') };
const OPEN = d('2026-10-07T12:00:00Z');
const LOCKED = d('2026-10-08T19:00:00Z');

describe('submitPicks', () => {
  let weekId: number;
  let gameIds: number[];
  let userId: number;

  beforeEach(async () => {
    await freshDb();
    const w = await makeWeek(W, [{}, {}, {}]);
    weekId = w.week.id;
    gameIds = w.games.map((g) => g.id);
    userId = (await makeUser('Ann')).id;
  });

  const all = (side: 'home' | 'away') => Object.fromEntries(gameIds.map((id) => [id, side]));

  it('creates an entry with picks; paid defaults to false', async () => {
    const r = await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 44 }, { now: OPEN });
    expect(r.ok).toBe(true);
    const e = await getEntry(userId, weekId);
    expect(e).toMatchObject({ tiebreaker: 44, paid: false, picks: all('home') });
    expect(e?.submittedAt).toEqual(OPEN);
  });

  it('replaces picks on resubmit and keeps paid', async () => {
    await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 44 }, { now: OPEN });
    const db = await getDb();
    await db.update(entries).set({ paid: true }).where(eq(entries.userId, userId));
    const later = d('2026-10-07T18:00:00Z');
    await submitPicks(userId, weekId, { picks: { ...all('away'), [gameIds[0]]: 'home' }, tiebreaker: 0 }, { now: later });
    const e = await getEntry(userId, weekId);
    expect(e).toMatchObject({ tiebreaker: 0, paid: true, updatedAt: later, submittedAt: OPEN });
    expect(e?.picks).toEqual({ ...all('away'), [gameIds[0]]: 'home' });
    expect(await listEntries(weekId)).toHaveLength(1);
  });

  it('rejects when the week is not open; admin may bypass', async () => {
    const r = await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 1 }, { now: LOCKED });
    expect(r).toMatchObject({ ok: false, error: 'week_not_open' });
    expect(await getEntry(userId, weekId)).toBeNull();
    const before = await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 1 }, { now: d('2026-10-05T00:00:00Z') });
    expect(before).toMatchObject({ ok: false, error: 'week_not_open' });
    const admin = await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 1 }, { now: LOCKED, asAdmin: true });
    expect(admin.ok).toBe(true);
  });

  it('honors a lock override', async () => {
    const { setWeekLockOverride } = await import('./weeks');
    await setWeekLockOverride(weekId, d('2026-10-09T19:00:00Z'));
    expect((await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 1 }, { now: LOCKED })).ok).toBe(true);
  });

  it('requires every game', async () => {
    const partial = { [gameIds[0]]: 'home' as const, [gameIds[1]]: 'away' as const };
    expect(await submitPicks(userId, weekId, { picks: partial, tiebreaker: 1 }, { now: OPEN })).toMatchObject({ error: 'incomplete' });
  });

  it('rejects unknown games and bad sides', async () => {
    expect(await submitPicks(userId, weekId, { picks: { ...all('home'), 99999: 'home' }, tiebreaker: 1 }, { now: OPEN })).toMatchObject({ error: 'invalid_pick' });
    const bad = { ...all('home'), [gameIds[0]]: 'tie' } as never;
    expect(await submitPicks(userId, weekId, { picks: bad, tiebreaker: 1 }, { now: OPEN })).toMatchObject({ error: 'invalid_pick' });
  });

  it('validates the tiebreaker as an integer in 0..200', async () => {
    for (const tb of [-1, 201, 1.5, NaN]) {
      expect(await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: tb }, { now: OPEN })).toMatchObject({ error: 'invalid_tiebreaker' });
    }
    for (const tb of [0, 200]) {
      expect((await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: tb }, { now: OPEN })).ok).toBe(true);
    }
  });

  it('unknown week', async () => {
    expect(await submitPicks(userId, 9999, { picks: {}, tiebreaker: 1 }, { now: OPEN })).toMatchObject({ error: 'week_not_found' });
  });

  it('listEntries returns names and picks for everyone', async () => {
    const bob = await makeUser('Bob');
    await submitPicks(bob.id, weekId, { picks: all('away'), tiebreaker: 10 }, { now: OPEN });
    await submitPicks(userId, weekId, { picks: all('home'), tiebreaker: 20 }, { now: OPEN });
    const list = await listEntries(weekId);
    expect(list.map((e) => [e.firstName, e.tiebreaker])).toEqual([['Ann', 20], ['Bob', 10]]);
    expect(list[1].picks).toEqual(all('away'));
    expect(await getEntry(999, weekId)).toBeNull();
  });
});
