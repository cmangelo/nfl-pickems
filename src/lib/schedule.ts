import { eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db';
import { games, weeks } from '@/db/schema';
import type { EspnClient, ScoreboardGame } from './espn';
import { ptDate, weekTuesday, weekUnlockAt } from './time';
import { defaultLockAt, defaultUnlockAt } from './weeks';

export const REGULAR_SEASON_LAST_WEEK = 18;

/**
 * Upserts ESPN games into a week, keyed by espn_id.
 * Always refreshes kickoff time, teams and week (flexes, Week 18 TBDs).
 * Scores / status / winner are refreshed only for games without manual_override.
 * An existing game is never moved into a week of a different season (skipped with a warning); moving
 * between weeks of the same season (a flex) is allowed and logged.
 */
export async function upsertScoreboardGames(db: Db, weekId: number, incoming: ScoreboardGame[]): Promise<number> {
  if (incoming.length === 0) return 0;
  const [target] = await db.select({ season: weeks.season, weekNumber: weeks.weekNumber }).from(weeks).where(eq(weeks.id, weekId));
  if (!target) throw new Error(`week ${weekId} not found`);
  const existing = await db
    .select({
      id: games.id,
      espnId: games.espnId,
      manualOverride: games.manualOverride,
      weekId: games.weekId,
      season: weeks.season,
      weekNumber: weeks.weekNumber,
    })
    .from(games)
    .innerJoin(weeks, eq(weeks.id, games.weekId))
    .where(inArray(games.espnId, incoming.map((g) => g.espnId)));
  const byEspn = new Map(existing.map((g) => [g.espnId, g]));
  let count = 0;
  for (const g of incoming) {
    const row = byEspn.get(g.espnId);
    const base = { weekId, kickoffAt: g.kickoffAt, homeTeam: g.homeTeam, awayTeam: g.awayTeam };
    const results = { homeScore: g.homeScore, awayScore: g.awayScore, status: g.status, winner: g.winner };
    // Live display fields always follow ESPN (a manual override hides them, since the game is then final).
    const live = {
      liveHomeScore: g.live?.homeScore ?? null,
      liveAwayScore: g.live?.awayScore ?? null,
      livePeriod: g.live?.period ?? null,
      liveClock: g.live?.clock ?? null,
      liveStatus: g.live?.status ?? null,
    };
    if (!row) {
      await db.insert(games).values({ espnId: g.espnId, ...base, ...results, ...live });
    } else {
      if (row.weekId !== weekId) {
        if (row.season !== target.season) {
          console.warn(
            `ESPN game ${g.espnId} belongs to season ${row.season} week ${row.weekNumber}; refusing to move it to season ${target.season} week ${target.weekNumber}`,
          );
          continue;
        }
        console.warn(`ESPN game ${g.espnId} moved from week ${row.weekNumber} to week ${target.weekNumber} (season ${target.season})`);
      }
      await db
        .update(games)
        .set(row.manualOverride ? { ...base, ...live } : { ...base, ...results, ...live })
        .where(eq(games.id, row.id));
    }
    count++;
  }
  return count;
}

export interface ImportResult {
  weeks: number;
  games: number;
}

/**
 * Imports regular-season weeks fromWeek..18. Weeks with no games on the feed are skipped.
 * Week unlock/lock come from the Tuesday (PT) on or before the first kickoff; the default lock is
 * min(Thu 12 PM PT / Thanksgiving 9 AM PT, earliest kickoff of the week).
 * An existing week keeps its admin lock override.
 */
export async function importSeason({
  season,
  fromWeek,
  client,
}: {
  season: number;
  fromWeek: number;
  client: EspnClient;
}): Promise<ImportResult> {
  const db = await getDb();
  const result: ImportResult = { weeks: 0, games: 0 };
  for (let weekNumber = Math.max(1, fromWeek); weekNumber <= REGULAR_SEASON_LAST_WEEK; weekNumber++) {
    const sb = await client.getScoreboard({ season, week: weekNumber });
    if (sb.length === 0) continue;
    const first = sb.reduce((a, b) => (b.kickoffAt < a.kickoffAt ? b : a)).kickoffAt;
    const tuesday = weekTuesday(first);
    // The default lock (Thu 12 PT / Thanksgiving 9 AM) can never be later than the first kickoff
    // (e.g. a Wednesday game): picks must close before any game starts.
    const lockAt = new Date(Math.min(defaultLockAt(tuesday).getTime(), first.getTime()));
    const times = { unlockAt: defaultUnlockAt(tuesday), lockAt };
    const [week] = await db
      .insert(weeks)
      .values({ season, weekNumber, ...times })
      .onConflictDoUpdate({ target: [weeks.season, weeks.weekNumber], set: times })
      .returning();
    result.weeks++;
    result.games += await upsertScoreboardGames(db, week.id, sb);
  }
  return result;
}

/**
 * Which regular-season week to start importing from at launch: the first week
 * with a kickoff on/after the start (Tuesday 00:00 PT) of the pick'em week containing `now`.
 * Returns null if the season has nothing left. No backfill of earlier weeks.
 */
export async function findStartWeek(client: EspnClient, season: number, now: Date): Promise<number | null> {
  const since = weekUnlockAt(weekTuesday(now));
  for (let w = 1; w <= REGULAR_SEASON_LAST_WEEK; w++) {
    const sb = await client.getScoreboard({ season, week: w });
    if (sb.some((g) => g.kickoffAt >= since)) return w;
  }
  return null;
}

export function seasonOf(now: Date): number {
  return ptDate(now).year;
}

export type LoadSeasonResult = { ok: true; season: number; fromWeek: number; weeks: number; games: number } | { ok: false; reason: 'none_found' };

/** Imports the current season from the week containing `at` onward (shared by the build script and the admin button). */
export async function loadSeasonSchedule(client: EspnClient, at: Date): Promise<LoadSeasonResult> {
  const season = seasonOf(at);
  const fromWeek = await findStartWeek(client, season, at);
  if (fromWeek === null) return { ok: false, reason: 'none_found' };
  const res = await importSeason({ season, fromWeek, client });
  return { ok: true, season, fromWeek, ...res };
}
