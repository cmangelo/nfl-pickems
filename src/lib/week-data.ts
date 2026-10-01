import { listEntries } from './picks';
import { weekSummary, type ScoringGame, type WeekSummary } from './scoring';

/** Entries + scoring summary for one week's games (computed on the fly). */
export async function loadWeekSummary(weekId: number, games: ScoringGame[]): Promise<WeekSummary> {
  const entries = await listEntries(weekId);
  return weekSummary(
    games,
    entries.map((e) => ({ userId: e.userId, name: e.firstName, paid: e.paid, tiebreaker: e.tiebreaker, picks: e.picks })),
  );
}
