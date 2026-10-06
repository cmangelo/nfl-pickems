import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { users, weeks } from '@/db/schema';
import { listEntries } from './picks';
import { entryLabel } from './week-view';
import { effectiveEntryFee, type EffectiveFee } from './pot';
import { weekSummary, type ScoringGame, type WeekSummary } from './scoring';
import { playerWeeks, seasonStats, type PlayerWeek, type SeasonRow, type SeasonStats, type SeasonWeekInput } from './season';
import { loadVisibleWeeks } from './selected-week';
import { resolveTiebreakerGame, type WeekRow } from './weeks';

/**
 * Entries + scoring summary for one week's games (computed on the fly). Freezes the tiebreaker game once locked.
 * Entries are named by username ("ann", or "ann (1)", "ann (2)"), as the leaderboard shows them.
 */
export async function loadWeekSummary<G extends ScoringGame>(week: WeekRow, games: G[], now: Date): Promise<WeekSummary> {
  const entries = await listEntries(week.id);
  const tb = await resolveTiebreakerGame(week, games, now);
  return weekSummary(
    games,
    entries.map((e) => ({ entryId: e.entryId, userId: e.userId, name: entryLabel(e.username, e.entryIndex, e.entryCount), paid: e.paid, tiebreaker: e.tiebreaker, picks: e.picks })),
    { tiebreakerGameId: tb?.id ?? null },
  );
}

/** The entry fee in effect for `week` (its own, or carried over from the latest earlier week with one). */
export async function loadEntryFee(week: Pick<WeekRow, 'season' | 'weekNumber'>): Promise<EffectiveFee | null> {
  const db = await getDb();
  const rows = await db.select({ season: weeks.season, weekNumber: weeks.weekNumber, entryFeeCents: weeks.entryFeeCents }).from(weeks);
  return effectiveEntryFee(rows, week);
}

/** Inputs for season stats: every visible week of `season` that is final at `now`, plus usernames by user id. */
async function loadSeasonInputs(season: number, now: Date): Promise<{ inputs: SeasonWeekInput[]; names: Map<number, string> }> {
  const db = await getDb();
  const [visible, feeRows] = await Promise.all([
    loadVisibleWeeks(now),
    db.select({ season: weeks.season, weekNumber: weeks.weekNumber, entryFeeCents: weeks.entryFeeCents }).from(weeks),
  ]);
  const done = visible.filter((v) => v.week.season === season && v.state === 'final');
  const names = new Map<number, string>();
  const inputs = await Promise.all(
    done.map(async ({ week, games }) => {
      const [list, tb] = await Promise.all([listEntries(week.id), resolveTiebreakerGame(week, games, now)]);
      for (const e of list) names.set(e.userId, e.username);
      return {
        weekId: week.id,
        weekNumber: week.weekNumber,
        games,
        entries: list.map((e) => ({ entryId: e.entryId, userId: e.userId, name: e.username, paid: e.paid, tiebreaker: e.tiebreaker, picks: e.picks })),
        tiebreakerGameId: tb?.id ?? null,
        feeCents: effectiveEntryFee(feeRows, week)?.cents ?? null,
      };
    }),
  );
  return { inputs, names };
}

/** Season stats for `season` over its final weeks and paid entries. Players are named by username, as on the leaderboard. */
export async function loadSeasonStats(season: number, now: Date): Promise<SeasonStats> {
  const { inputs, names } = await loadSeasonInputs(season, now);
  return seasonStats(inputs, names);
}

export interface PlayerSeason {
  /** null when the user does not exist. */
  username: string | null;
  /** Their season row, null when they have no counted entry in a final week. */
  row: SeasonRow | null;
  weeks: PlayerWeek[];
  hasMoney: boolean;
}

/** One player's season: their row of the season table plus a week-by-week breakdown. */
export async function loadPlayerSeason(season: number, userId: number, now: Date): Promise<PlayerSeason> {
  const db = await getDb();
  const [{ inputs, names }, [user]] = await Promise.all([
    loadSeasonInputs(season, now),
    db.select({ username: users.username }).from(users).where(eq(users.id, userId)),
  ]);
  const stats = seasonStats(inputs, names);
  return {
    username: user?.username ?? null,
    row: stats.rows.find((r) => r.userId === userId) ?? null,
    weeks: playerWeeks(inputs, userId),
    hasMoney: stats.hasMoney,
  };
}
