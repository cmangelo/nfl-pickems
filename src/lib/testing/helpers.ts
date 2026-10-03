import { getDb, resetDb } from '@/db';
import { entries, games, picks, users, weeks } from '@/db/schema';
import type { EspnClient, ScoreboardGame, ScoreboardParams } from '@/lib/espn';

/** Test-only helpers. Set process.env.DB_DRIVER = 'memory' at the top of the test file. */
export async function freshDb() {
  return resetDb();
}

export async function makeUser(firstName: string) {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ firstName, username: firstName.toLowerCase(), pinHash: 'x' })
    .returning();
  return u;
}

export async function makeWeek(
  opts: { season?: number; weekNumber?: number; unlockAt: Date; lockAt: Date },
  gameSpecs: Partial<typeof games.$inferInsert>[] = [],
) {
  const db = await getDb();
  const [week] = await db
    .insert(weeks)
    .values({ season: opts.season ?? 2026, weekNumber: opts.weekNumber ?? 5, unlockAt: opts.unlockAt, lockAt: opts.lockAt })
    .returning();
  const rows = gameSpecs.length
    ? await db
        .insert(games)
        .values(
          gameSpecs.map((g, i) => ({
            weekId: week.id,
            espnId: `t-${week.id}-${i}`,
            kickoffAt: new Date(opts.lockAt.getTime() + (i + 1) * 3600_000),
            homeTeam: `H${i}`,
            awayTeam: `A${i}`,
            ...g,
          })),
        )
        .returning()
    : [];
  rows.sort((a, b) => a.id - b.id);
  return { week, games: rows };
}

export async function makeEntry(
  userId: number,
  weekId: number,
  tiebreaker: number,
  paid: boolean,
  pickMap: Record<number, 'home' | 'away'>,
  entryNo = 1,
) {
  const db = await getDb();
  const [e] = await db.insert(entries).values({ userId, weekId, entryNo, tiebreaker, paid }).returning();
  const rows = Object.entries(pickMap).map(([g, p]) => ({ entryId: e.id, gameId: Number(g), pick: p }));
  if (rows.length) await db.insert(picks).values(rows);
  return e;
}

/** In-memory EspnClient keyed by `${season}-${week}`; records calls. */
export class StubEspnClient implements EspnClient {
  calls: ScoreboardParams[] = [];
  constructor(public boards: Record<string, ScoreboardGame[]> = {}) {}
  async getScoreboard(p: ScoreboardParams) {
    this.calls.push(p);
    return this.boards[`${p.season}-${p.week}`] ?? [];
  }
}

export function sbGame(espnId: string, kickoff: string, over: Partial<ScoreboardGame> = {}): ScoreboardGame {
  return {
    espnId,
    kickoffAt: new Date(kickoff),
    homeTeam: 'HOM',
    awayTeam: 'AWY',
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    winner: null,
    live: null,
    ...over,
  };
}
