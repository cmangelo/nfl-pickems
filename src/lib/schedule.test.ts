import { beforeEach, describe, expect, it } from 'vitest';
import { asc } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, weeks } from '@/db/schema';
import { FixtureEspnClient } from './espn/fixture';
import { findStartWeek, importSeason } from './schedule';
import { freshDb, sbGame, StubEspnClient } from './testing/helpers';
import { setWeekLockOverride } from './weeks';
import { adminOverrideGame } from './sync';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);

describe('importSeason (fixtures)', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('imports weeks that have fixtures from fromWeek on, skipping empty weeks', async () => {
    const res = await importSeason({ season: 2026, fromWeek: 5, client: new FixtureEspnClient() });
    expect(res).toEqual({ weeks: 3, games: 14 + 14 + 11 });
    const db = await getDb();
    const ws = await db.select().from(weeks).orderBy(asc(weeks.weekNumber));
    expect(ws.map((w) => w.weekNumber)).toEqual([5, 6, 12]);
    // week 5: first kickoff Thu Oct 8 PT -> Tuesday Oct 6, unlock Tue 00:00 PDT, lock Thu 12:00 PDT
    expect(ws[0].unlockAt).toEqual(d('2026-10-06T07:00:00Z'));
    expect(ws[0].lockAt).toEqual(d('2026-10-08T19:00:00Z'));
    // week 12: Thanksgiving, Tue Nov 24 00:00 PST, lock Thu 09:00 PST
    expect(ws[2].unlockAt).toEqual(d('2026-11-24T08:00:00Z'));
    expect(ws[2].lockAt).toEqual(d('2026-11-26T17:00:00Z'));
  });

  it('respects fromWeek (no backfill)', async () => {
    await importSeason({ season: 2026, fromWeek: 6, client: new FixtureEspnClient() });
    const db = await getDb();
    expect((await db.select().from(weeks)).map((w) => w.weekNumber).sort((a, b) => a - b)).toEqual([6, 12]);
  });

  it('is idempotent', async () => {
    const c = new FixtureEspnClient();
    await importSeason({ season: 2026, fromWeek: 5, client: c });
    await importSeason({ season: 2026, fromWeek: 5, client: c });
    const db = await getDb();
    expect(await db.select().from(weeks)).toHaveLength(3);
    expect(await db.select().from(games)).toHaveLength(39);
  });

  it('findStartWeek picks the first week with a kickoff in or after the current pick\'em week', async () => {
    const c = new FixtureEspnClient();
    expect(await findStartWeek(c, 2026, d('2026-10-07T20:00:00Z'))).toBe(5);
    expect(await findStartWeek(c, 2026, d('2026-10-14T20:00:00Z'))).toBe(6);
    expect(await findStartWeek(c, 2026, d('2026-12-20T20:00:00Z'))).toBeNull();
  });
});

describe('importSeason (updates)', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('updates kickoff/teams for flexes and TBDs; keeps lock override; keeps manual overrides', async () => {
    const client = new StubEspnClient({
      '2026-18': [sbGame('a', '2027-01-09T21:30:00Z', { homeTeam: 'TBD', awayTeam: 'TBD' }), sbGame('b', '2027-01-10T18:00:00Z')],
    });
    await importSeason({ season: 2026, fromWeek: 18, client });
    const db = await getDb();
    const [week] = await db.select().from(weeks);
    await setWeekLockOverride(week.id, d('2027-01-09T19:00:00Z'));
    const before = await db.select().from(games).orderBy(asc(games.espnId));
    await adminOverrideGame(before[1].id, { homeScore: 10, awayScore: 3 });

    client.boards['2026-18'] = [
      sbGame('a', '2027-01-10T01:15:00Z', { homeTeam: 'KC', awayTeam: 'DEN' }),
      sbGame('b', '2027-01-10T21:25:00Z', { homeScore: 1, awayScore: 2, status: 'final', winner: 'away' }),
    ];
    await importSeason({ season: 2026, fromWeek: 18, client });

    const [w2] = await db.select().from(weeks);
    expect(w2.lockOverrideAt).toEqual(d('2027-01-09T19:00:00Z'));
    const after = await db.select().from(games).orderBy(asc(games.espnId));
    expect(after[0]).toMatchObject({ homeTeam: 'KC', awayTeam: 'DEN', kickoffAt: d('2027-01-10T01:15:00Z') });
    expect(after[1].kickoffAt).toEqual(d('2027-01-10T21:25:00Z')); // time updated
    expect(after[1]).toMatchObject({ homeScore: 10, awayScore: 3, winner: 'home', manualOverride: true }); // result kept
  });
});
