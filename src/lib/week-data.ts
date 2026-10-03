import { listEntries } from './picks';
import { weekSummary, type ScoringGame, type WeekSummary } from './scoring';
import { resolveTiebreakerGame, type WeekRow } from './weeks';

/** Entries + scoring summary for one week's games (computed on the fly). Freezes the tiebreaker game once locked. */
export async function loadWeekSummary<G extends ScoringGame>(week: WeekRow, games: G[], now: Date): Promise<WeekSummary> {
  const entries = await listEntries(week.id);
  const tb = await resolveTiebreakerGame(week, games, now);
  return weekSummary(
    games,
    entries.map((e) => ({ entryId: e.entryId, userId: e.userId, name: e.label, paid: e.paid, tiebreaker: e.tiebreaker, picks: e.picks })),
    { tiebreakerGameId: tb?.id ?? null },
  );
}
