import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { freshDb, makeEntry, makeWeek } from './testing/helpers';
import { loadSeasonStats, loadWeekSummary } from './week-data';
import { weeks } from '@/db/schema';
import { eq } from 'drizzle-orm';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);
const W = { weekNumber: 5, unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') };
const LOCKED = d('2026-10-08T20:00:00Z');

async function user(firstName: string, username: string) {
  const db = await getDb();
  const [u] = await db.insert(users).values({ firstName, username, pinHash: 'x' }).returning();
  return u;
}

describe('loadWeekSummary', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('names entries by username, numbering a player with several entries', async () => {
    const { week, games } = await makeWeek(W, [{}, {}]);
    const ann = await user('Ann', 'annie99');
    const bob = await user('Bob', 'bobcat');
    const picks = { [games[0].id]: 'home', [games[1].id]: 'away' } as const;
    await makeEntry(ann.id, week.id, 40, true, picks, 1);
    await makeEntry(ann.id, week.id, 41, true, picks, 2);
    await makeEntry(bob.id, week.id, 42, false, picks, 1);

    const s = await loadWeekSummary(week, games, LOCKED);
    expect(s.ranked.map((e) => e.name).sort()).toEqual(['annie99 (1)', 'annie99 (2)']);
    expect(s.notCounted.map((e) => e.name)).toEqual(['bobcat']);
  });
});

describe('loadSeasonStats', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('aggregates final weeks of the season only, with the carried-over fee, named by username', async () => {
    const fin = (winner: 'home' | 'away') => ({ status: 'final' as const, winner, homeScore: winner === 'home' ? 20 : 10, awayScore: winner === 'home' ? 10 : 20 });
    // Week 4 final (fee $5 set here), week 5 final (fee carried over), week 6 locked (one game pending), 2025 week final.
    const w4 = await makeWeek({ weekNumber: 4, unlockAt: d('2026-09-29T07:00:00Z'), lockAt: d('2026-10-01T19:00:00Z') }, [fin('home'), fin('away')]);
    const w5 = await makeWeek(W, [fin('home'), fin('home')]);
    const w6 = await makeWeek({ weekNumber: 6, unlockAt: d('2026-10-07T07:00:00Z'), lockAt: d('2026-10-08T19:30:00Z') }, [fin('home'), {}]);
    const old = await makeWeek({ season: 2025, weekNumber: 18, unlockAt: d('2025-12-30T08:00:00Z'), lockAt: d('2026-01-01T20:00:00Z') }, [fin('home')]);
    const db = await getDb();
    await db.update(weeks).set({ entryFeeCents: 500 }).where(eq(weeks.id, w4.week.id));
    const ann = await user('Ann', 'annie99');
    const bob = await user('Bob', 'bobcat');
    const g = (w: typeof w4) => w.games.map((x) => x.id);
    await makeEntry(ann.id, w4.week.id, 30, true, { [g(w4)[0]]: 'home', [g(w4)[1]]: 'away' });
    await makeEntry(bob.id, w4.week.id, 30, true, { [g(w4)[0]]: 'away', [g(w4)[1]]: 'away' });
    await makeEntry(ann.id, w5.week.id, 30, true, { [g(w5)[0]]: 'away', [g(w5)[1]]: 'away' });
    await makeEntry(bob.id, w5.week.id, 30, true, { [g(w5)[0]]: 'home', [g(w5)[1]]: 'away' });
    await makeEntry(ann.id, w6.week.id, 30, true, { [g(w6)[0]]: 'home', [g(w6)[1]]: 'away' });
    await makeEntry(bob.id, old.week.id, 30, true, { [g(old)[0]]: 'home' });

    const s = await loadSeasonStats(2026, d('2026-10-09T20:00:00Z'));
    expect(s.weekNumbers).toEqual([4, 5]);
    expect(s.hasMoney).toBe(true);
    const by = Object.fromEntries(s.rows.map((r) => [r.name, r]));
    expect(Object.keys(by).sort()).toEqual(['annie99', 'bobcat']);
    expect(by.annie99).toMatchObject({ correct: 2, graded: 4, wins: 1, weeks: 2, winningsCents: 1000, feesCents: 1000, netCents: 0 });
    expect(by.bobcat).toMatchObject({ correct: 2, graded: 4, wins: 1, weeks: 2 });
  });
});
