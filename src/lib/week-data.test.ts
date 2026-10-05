import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { freshDb, makeEntry, makeWeek } from './testing/helpers';
import { loadWeekSummary } from './week-data';

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
