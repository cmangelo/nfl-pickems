import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, weeks } from '@/db/schema';
import { MAX_ENTRIES_PER_WEEK, deleteEntry, getEntries, getEntry, listEntries, submitPicks } from './picks';
import { freshDb, makeUser, makeWeek } from './testing/helpers';
import { resolveTiebreakerGame } from './weeks';

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
    // Games kick off at lock+1h, so a lock up to the first kickoff (20:00Z) is allowed.
    expect(await setWeekLockOverride(weekId, d('2026-10-08T20:00:00Z'))).toEqual({ ok: true });
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

describe('submitPicks: games that already started (M1)', () => {
  // Game 0 kicked off Wed 18:00Z (before the Thu lock); games 1-2 kick off after.
  let weekId: number;
  let gameIds: number[];
  let userId: number;
  const WED_EVE = d('2026-10-07T19:00:00Z');

  beforeEach(async () => {
    await freshDb();
    const w = await makeWeek(W, [{ kickoffAt: d('2026-10-07T18:00:00Z') }, {}, {}]);
    weekId = w.week.id;
    gameIds = w.games.map((g) => g.id);
    userId = (await makeUser('Ann')).id;
  });

  const picksOf = (a: 'home' | 'away', b: 'home' | 'away', c: 'home' | 'away') => ({ [gameIds[0]]: a, [gameIds[1]]: b, [gameIds[2]]: c });

  it('rejects a first submission once a game has started', async () => {
    const r = await submitPicks(userId, weekId, { picks: picksOf('home', 'home', 'home'), tiebreaker: 1 }, { now: WED_EVE });
    expect(r).toMatchObject({ ok: false, error: 'game_started', message: "Picks for games that already started can't be changed." });
    expect(await getEntry(userId, weekId)).toBeNull();
  });

  it('keeps the stored pick: changing a started game is rejected, changing the others is fine', async () => {
    const early = d('2026-10-07T12:00:00Z'); // before the Wed game kicks off
    expect((await submitPicks(userId, weekId, { picks: picksOf('home', 'home', 'home'), tiebreaker: 10 }, { now: early })).ok).toBe(true);

    const bad = await submitPicks(userId, weekId, { picks: picksOf('away', 'away', 'away'), tiebreaker: 20 }, { now: WED_EVE });
    expect(bad).toMatchObject({ ok: false, error: 'game_started' });
    expect(await getEntry(userId, weekId)).toMatchObject({ tiebreaker: 10, picks: picksOf('home', 'home', 'home') });

    const ok = await submitPicks(userId, weekId, { picks: picksOf('home', 'away', 'away'), tiebreaker: 20 }, { now: WED_EVE });
    expect(ok.ok).toBe(true);
    expect(await getEntry(userId, weekId)).toMatchObject({ tiebreaker: 20, picks: picksOf('home', 'away', 'away') });
  });

  it('admins may still edit started games (asAdmin)', async () => {
    const r = await submitPicks(userId, weekId, { picks: picksOf('home', 'home', 'home'), tiebreaker: 1 }, { now: WED_EVE, asAdmin: true });
    expect(r.ok).toBe(true);
  });
});

describe('submitPicks: atomic write and admin audit (M4, M6)', () => {
  let weekId: number;
  let gameIds: number[];
  let ann: number;
  let boss: number;
  beforeEach(async () => {
    await freshDb();
    const w = await makeWeek(W, [{}, {}]);
    weekId = w.week.id;
    gameIds = w.games.map((g) => g.id);
    ann = (await makeUser('Ann')).id;
    boss = (await makeUser('Boss')).id;
  });
  const both = (side: 'home' | 'away') => Object.fromEntries(gameIds.map((id) => [id, side]));

  it('writes the entry and every pick in one statement; a bad input writes nothing', async () => {
    const bad = await submitPicks(ann, weekId, { picks: { [gameIds[0]]: 'home' }, tiebreaker: 5 }, { now: OPEN });
    expect(bad.ok).toBe(false);
    expect(await getEntry(ann, weekId)).toBeNull();
    const r = await submitPicks(ann, weekId, { picks: both('away'), tiebreaker: 5 }, { now: OPEN });
    expect(r.ok && (await getEntry(ann, weekId))?.entryId).toBe(r.ok && r.entryId);
    expect((await getEntry(ann, weekId))?.picks).toEqual(both('away'));
    // A statement-level failure (unknown user id => FK violation) leaves no orphan picks/entries.
    await expect(submitPicks(99999, weekId, { picks: both('home'), tiebreaker: 1 }, { now: OPEN })).rejects.toThrow();
    expect(await listEntries(weekId)).toHaveLength(1);
  });

  it('records admin edits of another player and shows them via getEntry/listEntries', async () => {
    await submitPicks(ann, weekId, { picks: both('home'), tiebreaker: 1 }, { now: OPEN });
    expect((await getEntry(ann, weekId))?.adminEditedAt).toBeNull();
    const t = d('2026-10-09T10:00:00Z');
    await submitPicks(ann, weekId, { picks: both('away'), tiebreaker: 2 }, { now: t, asAdmin: true, actorId: boss });
    expect(await getEntry(ann, weekId)).toMatchObject({ editedByAdminId: boss, editedByName: 'Boss', adminEditedAt: t });
    expect((await listEntries(weekId))[0]).toMatchObject({ editedByName: 'Boss', adminEditedAt: t });
    // A later edit by the player keeps the audit trail.
    await submitPicks(ann, weekId, { picks: both('home'), tiebreaker: 3 }, { now: OPEN });
    expect((await getEntry(ann, weekId))?.adminEditedAt).toEqual(t);
  });

  it('an admin may edit their own entry after the lock; only the post-lock edit is flagged', async () => {
    const own = await submitPicks(boss, weekId, { picks: both('home'), tiebreaker: 1 }, { now: OPEN, asAdmin: true, actorId: boss });
    expect(own.ok).toBe(true);
    expect((await getEntry(boss, weekId))?.adminEditedAt).toBeNull();
    const late = await submitPicks(boss, weekId, { picks: both('away'), tiebreaker: 2 }, { now: LOCKED, asAdmin: true, actorId: boss });
    expect(late.ok).toBe(true);
    expect(await getEntry(boss, weekId)).toMatchObject({ picks: both('away'), tiebreaker: 2, editedByAdminId: boss, adminEditedAt: LOCKED });
    // Editing someone else after the lock is fine.
    expect((await submitPicks(ann, weekId, { picks: both('away'), tiebreaker: 1 }, { now: LOCKED, asAdmin: true, actorId: boss })).ok).toBe(true);
  });
});

describe('multiple entries per week', () => {
  let weekId: number;
  let gameIds: number[];
  let ann: number;
  let bob: number;
  beforeEach(async () => {
    await freshDb();
    const w = await makeWeek(W, [{}, {}]);
    weekId = w.week.id;
    gameIds = w.games.map((g) => g.id);
    ann = (await makeUser('Ann')).id;
    bob = (await makeUser('Bob')).id;
  });
  const both = (side: 'home' | 'away') => Object.fromEntries(gameIds.map((id) => [id, side]));
  const save = (userId: number, side: 'home' | 'away', tb: number, opts: { entryId?: number; newEntry?: boolean; now?: Date; asAdmin?: boolean } = {}) =>
    submitPicks(userId, weekId, { picks: both(side), tiebreaker: tb }, { now: OPEN, ...opts });
  const idOf = (r: Awaited<ReturnType<typeof submitPicks>>) => (r.ok ? r.entryId : NaN);

  it('newEntry adds a separate, unpaid entry; each is edited by id', async () => {
    const first = idOf(await save(ann, 'home', 10));
    const second = idOf(await save(ann, 'away', 20, { newEntry: true }));
    expect(second).not.toBe(first);
    let list = await getEntries(ann, weekId);
    expect(list.map((e) => [e.entryNo, e.tiebreaker, e.paid])).toEqual([[1, 10, false], [2, 20, false]]);
    expect(list[1].picks).toEqual(both('away'));

    expect((await save(ann, 'away', 11, { entryId: first })).ok).toBe(true);
    list = await getEntries(ann, weekId);
    expect(list.map((e) => [e.entryId, e.tiebreaker])).toEqual([[first, 11], [second, 20]]);
    expect(list[0].picks).toEqual(both('away'));
    // No target = the first entry.
    expect(idOf(await save(ann, 'home', 12))).toBe(first);
    expect((await getEntry(ann, weekId))?.tiebreaker).toBe(12);
  });

  it('newEntry with no entries yet creates entry 1', async () => {
    await save(ann, 'home', 10, { newEntry: true });
    expect((await getEntries(ann, weekId)).map((e) => e.entryNo)).toEqual([1]);
  });

  it(`caps a player at ${MAX_ENTRIES_PER_WEEK} entries`, async () => {
    for (let i = 0; i < MAX_ENTRIES_PER_WEEK; i++) expect((await save(ann, 'home', i, { newEntry: true })).ok).toBe(true);
    expect(await save(ann, 'home', 99, { newEntry: true })).toMatchObject({ ok: false, error: 'entry_limit' });
    expect(await getEntries(ann, weekId)).toHaveLength(MAX_ENTRIES_PER_WEEK);
    // Freeing a slot reuses it.
    const third = (await getEntries(ann, weekId))[2];
    expect(await deleteEntry(third.entryId, { now: OPEN, userId: ann })).toEqual({ ok: true });
    expect((await save(ann, 'home', 7, { newEntry: true })).ok).toBe(true);
    expect((await getEntries(ann, weekId)).find((e) => e.entryNo === 3)?.tiebreaker).toBe(7);
  });

  it('concurrent newEntry saves never share a slot', async () => {
    await save(ann, 'home', 1);
    const rs = await Promise.all([save(ann, 'home', 2, { newEntry: true }), save(ann, 'away', 3, { newEntry: true })]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await getEntries(ann, weekId)).map((e) => e.entryNo)).toEqual([1, 2, 3]);
  });

  it("rejects someone else's entry id, or one from another week", async () => {
    const bobs = idOf(await save(bob, 'home', 10));
    expect(await save(ann, 'away', 5, { entryId: bobs })).toMatchObject({ ok: false, error: 'entry_not_found' });
    expect((await getEntry(bob, weekId))?.picks).toEqual(both('home'));
    const other = await makeWeek({ ...W, weekNumber: 6 }, [{}]);
    const r = await submitPicks(bob, other.week.id, { picks: { [other.games[0].id]: 'home' }, tiebreaker: 1 }, { now: OPEN, entryId: bobs });
    expect(r).toMatchObject({ ok: false, error: 'entry_not_found' });
  });

  it('checks started games against the targeted entry; no new entries after a kickoff', async () => {
    const db = await getDb();
    const { games } = await import('@/db/schema');
    const first = idOf(await save(ann, 'home', 10));
    const second = idOf(await save(ann, 'away', 20, { newEntry: true }));
    await db.update(games).set({ kickoffAt: d('2026-10-07T18:00:00Z') }).where(eq(games.id, gameIds[0]));
    const after = d('2026-10-07T19:00:00Z');
    // Entry 2 keeps its own started pick (away) while changing the rest.
    const mixed = { [gameIds[0]]: 'away' as const, [gameIds[1]]: 'home' as const };
    expect((await submitPicks(ann, weekId, { picks: mixed, tiebreaker: 21 }, { now: after, entryId: second })).ok).toBe(true);
    // ...but entry 1 can't take that pick.
    expect(await submitPicks(ann, weekId, { picks: mixed, tiebreaker: 11 }, { now: after, entryId: first })).toMatchObject({ error: 'game_started' });
    expect(await save(ann, 'home', 30, { newEntry: true, now: after })).toMatchObject({ error: 'game_started' });
    expect((await save(ann, 'home', 30, { newEntry: true, now: after, asAdmin: true })).ok).toBe(true);
  });

  it('listEntries labels players with several entries', async () => {
    await save(bob, 'home', 1);
    await save(ann, 'home', 2);
    await save(ann, 'away', 3, { newEntry: true });
    const list = await listEntries(weekId);
    expect(list.map((e) => [e.label, e.entryIndex, e.entryCount, e.tiebreaker])).toEqual([
      ['Ann (1)', 0, 2, 2],
      ['Ann (2)', 1, 2, 3],
      ['Bob', 0, 1, 1],
    ]);
  });

  it('deleteEntry: players keep at least one entry and only while open; admins may delete any', async () => {
    const first = idOf(await save(ann, 'home', 10));
    expect(await deleteEntry(first, { now: OPEN, userId: ann })).toMatchObject({ ok: false });
    const second = idOf(await save(ann, 'away', 20, { newEntry: true }));
    expect(await deleteEntry(second, { now: OPEN, userId: bob })).toMatchObject({ ok: false, error: 'Entry not found.' });
    expect(await deleteEntry(second, { now: LOCKED, userId: ann })).toMatchObject({ ok: false });
    // Deleting entry 1 leaves entry 2, which is now the player's (only) entry.
    expect(await deleteEntry(first, { now: OPEN, userId: ann })).toEqual({ ok: true });
    expect((await getEntries(ann, weekId)).map((e) => [e.entryId, e.entryNo])).toEqual([[second, 2]]);
    expect((await listEntries(weekId))[0].label).toBe('Ann');
    expect(await deleteEntry(second, { now: LOCKED, asAdmin: true })).toEqual({ ok: true });
    expect(await getEntries(ann, weekId)).toEqual([]);
    expect(await deleteEntry(second, { now: OPEN, asAdmin: true })).toMatchObject({ ok: false });
  });
});

describe('resolveTiebreakerGame (L4)', () => {
  it('computes live before the lock, then freezes at the lock even if a game moves', async () => {
    await freshDb();
    // Sunday game (kickoff Sun Oct 11 PT) and Monday game (Mon Oct 12 PT).
    const w = await makeWeek(W, [
      { kickoffAt: d('2026-10-11T20:00:00Z') },
      { kickoffAt: d('2026-10-13T00:15:00Z') },
    ]);
    const [sun, mon] = w.games;
    const db = await getDb();
    const reload = async () => (await db.select().from(weeks).where(eq(weeks.id, w.week.id)))[0];

    // Before the lock: live, nothing stored.
    expect((await resolveTiebreakerGame(w.week, w.games, OPEN))?.id).toBe(mon.id);
    expect((await reload()).tiebreakerGameId).toBeNull();

    // At/after the lock: persisted.
    expect((await resolveTiebreakerGame(await reload(), w.games, LOCKED))?.id).toBe(mon.id);
    expect((await reload()).tiebreakerGameId).toBe(mon.id);

    // The Sunday game is flexed to a later Monday slot after the lock: the tiebreaker stays on Monday's game.
    const moved = [{ ...sun, kickoffAt: d('2026-10-13T03:00:00Z') }, mon];
    expect((await resolveTiebreakerGame(await reload(), moved, d('2026-10-12T00:00:00Z')))?.id).toBe(mon.id);
    // ...whereas computing it fresh would have picked the moved game.
    expect((await resolveTiebreakerGame({ ...(await reload()), tiebreakerGameId: null, lockAt: W.lockAt }, moved, OPEN))?.id).toBe(sun.id);
  });

  it('submitPicks (admin, after the lock) freezes it too', async () => {
    await freshDb();
    const w = await makeWeek(W, [{ kickoffAt: d('2026-10-11T20:00:00Z') }, { kickoffAt: d('2026-10-13T00:15:00Z') }]);
    const u = await makeUser('Ann');
    await submitPicks(u.id, w.week.id, { picks: { [w.games[0].id]: 'home', [w.games[1].id]: 'home' }, tiebreaker: 3 }, { now: LOCKED, asAdmin: true });
    const db = await getDb();
    expect((await db.select().from(weeks))[0].tiebreakerGameId).toBe(w.games[1].id);
  });
});
