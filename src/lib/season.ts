import { computePot } from './pot';
import { weekSummary, type ScoringEntry, type ScoringGame } from './scoring';
import { compareRows, netLabel, pct0, pct1, tbAvgLabel, type BestWeek, type SeasonRow } from './season-view';

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
  /** Some counted week had a fee: show the money columns. */
  hasMoney: boolean;
}

/**
 * Aggregates final weeks into one row per player with a counted entry. Weeks that are not final are skipped.
 * Rows come sorted by the default season order (`compareRows(..., 'pct')`).
 */
export function seasonStats(weeks: SeasonWeekInput[], names: Map<number, string>): SeasonStats {
  // run = the current streak of correct picks, carried from week to week.
  const rows = new Map<number, SeasonRow & { tbSum: number; tbCount: number; run: number }>();
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
        winningsCents: 0,
        feesCents: 0,
        netCents: 0,
        streak: 0,
        tbSum: 0,
        tbCount: 0,
        run: 0,
      };
      rows.set(userId, r);
    }
    return r;
  };

  const weekNumbers: number[] = [];
  let hasMoney = false;
  for (const w of [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    const summary = weekSummary(w.games, w.entries, { tiebreakerGameId: w.tiebreakerGameId });
    if (!summary.isFinal || summary.ranked.length === 0) continue;
    weekNumbers.push(w.weekNumber);
    const pot = computePot(w.feeCents, summary.ranked.length);
    if (pot) hasMoney = true;
    const share = pot && summary.winners.length > 0 ? Math.floor(pot.totalCents / summary.winners.length) : 0;
    const played = new Set<number>();
    const won = new Set<number>();
    const podium = new Set<number>();
    for (const e of summary.ranked) {
      const r = row(e.userId);
      played.add(e.userId);
      r.entries++;
      r.correct += e.correct;
      r.graded += e.correct + e.wrong;
      if (pot) r.feesCents += pot.feeCents;
      if (e.rank === 1) {
        won.add(e.userId);
        r.winningsCents += share;
      }
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
    // Streak: the player's first counted entry each week, games in kickoff order; a miss or tie ends it,
    // a void game is skipped, and a week sat out leaves it running.
    const ordered = playable(w.games);
    for (const id of played) {
      const r = row(id);
      const first = summary.ranked.filter((e) => e.userId === id).reduce((a, b) => (b.entryId < a.entryId ? b : a));
      for (const g of ordered) {
        r.run = g.winner !== 'tie' && first.picks[g.id] === g.winner ? r.run + 1 : 0;
        r.streak = Math.max(r.streak, r.run);
      }
    }
    for (const id of played) row(id).weeks++;
    for (const id of won) row(id).wins++;
    for (const id of podium) row(id).top3++;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const out: SeasonRow[] = [...rows.values()].map(({ tbSum, tbCount, run, ...r }) => ({
    ...r,
    pct: r.graded > 0 ? r.correct / r.graded : null,
    avgTbDiff: tbCount > 0 ? tbSum / tbCount : null,
    netCents: r.winningsCents - r.feesCents,
  }));
  out.sort((a, b) => compareRows(a, b, 'pct'));
  return { rows: out, weekNumbers, hasMoney };
}

/** Non-void games in kickoff order. */
const playable = (games: ScoringGame[]) =>
  games.filter((g) => g.status !== 'void').sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.id - b.id);

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

export interface SeasonLeader {
  id: 'wins' | 'pct' | 'best' | 'tb' | 'streak' | 'net';
  /** Card title, e.g. "Most wins". */
  title: string;
  names: string[];
  value: string;
  /** Small line under the value, e.g. "Week 4". */
  sub?: string;
}

/** Holders of the best value of `pick` (ties share the card); null when nobody has one. */
function leader(rows: SeasonRow[], pick: (r: SeasonRow) => number | null, ascending: boolean): { value: number; names: string[] } | null {
  const vals = rows.map((r) => ({ r, v: pick(r) })).filter((x): x is { r: SeasonRow; v: number } => x.v !== null);
  if (vals.length === 0) return null;
  const best = ascending ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v));
  return { value: best, names: vals.filter((x) => x.v === best).map((x) => x.r.name).sort((a, b) => a.localeCompare(b)) };
}

/**
 * Season superlatives for the cards above the table: most wins, best percent, best single week,
 * sharpest tiebreaker, longest run of correct picks and (with a pot) most money up. A card is left out when nobody qualifies
 * (no wins yet, no tiebreaker graded, nobody up).
 */
export function seasonLeaders(stats: SeasonStats): SeasonLeader[] {
  const { rows } = stats;
  const out: SeasonLeader[] = [];
  const wins = leader(rows, (r) => (r.wins > 0 ? r.wins : null), false);
  if (wins) out.push({ id: 'wins', title: 'Most wins', names: wins.names, value: `${wins.value} ${wins.value === 1 ? 'win' : 'wins'}` });
  const pct = leader(rows, (r) => r.pct, false);
  if (pct) out.push({ id: 'pct', title: 'Best percent', names: pct.names, value: pct1(pct.value) });
  const best = leader(rows, (r) => r.best?.pct ?? null, false);
  if (best) {
    const holders = rows.filter((r) => r.best?.pct === best.value);
    const weeks = [...new Set(holders.map((r) => r.best!.weekNumber))].sort((a, b) => a - b);
    out.push({ id: 'best', title: 'Best week', names: best.names, value: pct0(best.value), sub: `${weeks.length === 1 ? 'Week' : 'Weeks'} ${weeks.join(', ')}` });
  }
  const tb = leader(rows, (r) => r.avgTbDiff, true);
  if (tb) out.push({ id: 'tb', title: 'Sharpest tiebreaker', names: tb.names, value: `${tbAvgLabel(tb.value)} avg` });
  const streak = leader(rows, (r) => (r.streak > 0 ? r.streak : null), false);
  if (streak) out.push({ id: 'streak', title: 'Hot streak', names: streak.names, value: `${streak.value} straight` });
  if (stats.hasMoney) {
    const net = leader(rows, (r) => (r.netCents > 0 ? r.netCents : null), false);
    if (net) out.push({ id: 'net', title: 'Most money up', names: net.names, value: netLabel(net.value) });
  }
  return out;
}
