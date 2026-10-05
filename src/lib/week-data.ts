import { getDb } from '@/db';
import { weeks } from '@/db/schema';
import { listEntries } from './picks';
import { entryLabel } from './week-view';
import { effectiveEntryFee, type EffectiveFee } from './pot';
import { weekSummary, type ScoringGame, type WeekSummary } from './scoring';
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
