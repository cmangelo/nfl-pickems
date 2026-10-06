import { computePot } from './pot';
import { weekSummary, type ScoringEntry, type ScoringGame } from './scoring';
import { compareRows, type BestWeek, type SeasonRow } from './season-view';

export * from './season-view';

/**
 * Season-long stats (pure; server-side because scoring.ts is). Built from completed (final) weeks only, over paid entries,
 * exactly as each week's own leaderboard counts them. Computed on the fly; there is no stats table.
 */

export interface SeasonWeekInput {
  weekId: number;
  weekNumber: number;
  games: ScoringGame[];
  /** Every entry of the week (paid or not); `name` is unused here, players are named by `names`. */
  entries: ScoringEntry[];
  tiebreakerGameId: number | null;
  /** Entry fee in effect for the week (null or 0 = no pot). */
  feeCents: number | null;
}

export interface SeasonStats {
  rows: SeasonRow[];
  /** Completed weeks counted, ascending. */
  weekNumbers: number[];
}

/**
 * Aggregates final weeks into one row per player with a counted entry. Weeks that are not final are skipped.
 * Rows come sorted by the default season order (`compareRows(..., 'pct')`).
 */
export function seasonStats(weeks: SeasonWeekInput[], names: Map<number, string>): SeasonStats {
  const rows = new Map<number, SeasonRow & { tbSum: number; tbCount: number }>();
  const row = (userId: number) => {
    let r = rows.get(userId);
    if (!r) {
      r = {
        userId,
        name: names.get(userId) ?? `#${userId}`,
        weeks: 0,
        entries: 0,
        correct: 0,
        graded: 0,
        pct: null,
        best: null,
        wins: 0,
        top3: 0,
        avgTbDiff: null,
        tbSum: 0,
        tbCount: 0,
      };
      rows.set(userId, r);
    }
    return r;
  };

  const weekNumbers: number[] = [];
  for (const w of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const summary = weekSummary(w.games, w.entries, { tiebreakerGameId: w.tiebreakerGameId });
    if (!summary.isFinal || summary.ranked.length === 0) continue;
    weekNumbers.push(w.weekNumber);
    const played = new Set<number>();
    const won = new Set<number>();
    const podium = new Set<number>();
    for (const e of summary.ranked) {
      const r = row(e.userId);
      played.add(e.userId);
      r.entries++;
      r.correct += e.correct;
      r.graded += e.correct + e.wrong;
      if (e.rank === 1) won.add(e.userId);
      if (e.rank <= 3) podium.add(e.userId);
      if (e.tiebreakerDiff !== null) {
        r.tbSum += e.tiebreakerDiff;
        r.tbCount++;
      }
      const total = e.correct + e.wrong;
      if (total > 0) {
        const cand: BestWeek = { weekId: w.weekId, weekNumber: w.weekNumber, correct: e.correct, total, pct: e.correct / total };
        // Weeks are visited in order, so on a full tie the earlier week stays.
        if (!r.best || cand.pct > r.best.pct || (cand.pct === r.best.pct && cand.correct > r.best.correct)) r.best = cand;
      }
    }
    for (const id of played) row(id).weeks++;
    for (const id of won) row(id).wins++;
    for (const id of podium) row(id).top3++;
  }

  const out: SeasonRow[] = [...rows.values()].map(({ tbSum, tbCount, ...r }) => ({
    ...r,
    pct: r.graded > 0 ? r.correct / r.graded : null,
    avgTbDiff: tbCount > 0 ? tbSum / tbCount : null,
  }));
  out.sort((a, b) => compareRows(a, b, 'pct'));
  return { rows: out, weekNumbers };
}

export interface PlayerWeekEntry {
  entryId: number;
  /** "Entry 2" when the player had several entries that week, else null. */
  label: string | null;
  rank: number;
  tied: boolean;
  correct: number;
  total: number;
  tbDiff: number | null;
  /** Pot share won (0 when not a winner or no pot). */
  payoutCents: number;
}

export interface PlayerWeek {
  weekId: number;
  weekNumber: number;
  /** Counted (paid) entries, in entry order. */
  entries: PlayerWeekEntry[];
}

/** One player's completed weeks (newest first) with each counted entry's finish, score, tiebreaker and payout. */
export function playerWeeks(weeks: SeasonWeekInput[], userId: number): PlayerWeek[] {
  const out: PlayerWeek[] = [];
  for (const w of [...weeks].sort((a, b) => b.weekNumber - a.weekNumber)) {
    const summary = weekSummary(w.games, w.entries, { tiebreakerGameId: w.tiebreakerGameId });
    if (!summary.isFinal) continue;
    const all = w.entries.filter((e) => e.userId === userId).map((e) => e.entryId);
    const mine = summary.ranked.filter((e) => e.userId === userId);
    if (mine.length === 0) continue;
    const pot = computePot(w.feeCents, summary.ranked.length);
    const share = pot && summary.winners.length > 0 ? Math.floor(pot.totalCents / summary.winners.length) : 0;
    out.push({
      weekId: w.weekId,
      weekNumber: w.weekNumber,
      entries: mine
        .map((e) => ({
          entryId: e.entryId,
          label: all.length > 1 ? `Entry ${all.indexOf(e.entryId) + 1}` : null,
          rank: e.rank,
          tied: e.tied,
          correct: e.correct,
          total: e.correct + e.wrong,
          tbDiff: e.tiebreakerDiff,
          payoutCents: e.rank === 1 ? share : 0,
        }))
        .sort((a, b) => all.indexOf(a.entryId) - all.indexOf(b.entryId)),
    });
  }
  return out;
}
