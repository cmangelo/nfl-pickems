import type { ScoringGame, Side, Upset } from './scoring';
import { ptDayOfWeek } from './time';

/** Pure view helpers for the Leaderboard / Games views (no DB, no clock reads). Never "X of N players". */

/** Upset counts are per entry (a player may have several entries in a week). */
export const entriesLabel = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Updated just now" / "Updated 3 min ago" / "Updated 2 hr ago" / "Updated 3 days ago". */
export function formatUpdatedAgo(last: Date | null, at: Date): string {
  if (!last) return 'Not synced yet';
  const min = Math.max(0, Math.floor((at.getTime() - last.getTime()) / 60_000));
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Updated ${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return `Updated ${d} day${d === 1 ? '' : 's'} ago`;
}

/** Short label for the tiebreaker guess: "MNF" when the tiebreaker game is on Monday (PT), else "TB". */
export function tiebreakerShortLabel(game: Pick<ScoringGame, 'kickoffAt'> | null | undefined): 'MNF' | 'TB' {
  return game && ptDayOfWeek(game.kickoffAt) === 1 ? 'MNF' : 'TB';
}

/** "(±3)" once the tiebreaker game is final, else "". */
export function tiebreakerDiffLabel(diff: number | null): string {
  return diff === null ? '' : `(±${diff})`;
}

export interface UpsetGameLike {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: 'home' | 'away' | 'tie' | null;
}

/** "CHI over LV, 24–20" (null when the game has no decisive result). */
export function upsetHeadline(g: UpsetGameLike): string | null {
  if (g.winner !== 'home' && g.winner !== 'away') return null;
  const win = g.winner === 'home' ? g.homeTeam : g.awayTeam;
  const lose = g.winner === 'home' ? g.awayTeam : g.homeTeam;
  const ws = g.winner === 'home' ? g.homeScore : g.awayScore;
  const ls = g.winner === 'home' ? g.awayScore : g.homeScore;
  const score = ws !== null && ls !== null ? `, ${ws}–${ls}` : '';
  return `${win} over ${lose}${score}`;
}

/** "8 entries got it wrong". */
export function upsetWrongText(u: Pick<Upset, 'wrongCount'>): string {
  return `${entriesLabel(u.wrongCount)} got it wrong`;
}

/** "Only 1 entry picked it (Sarah)" / "Nobody picked it" / null when there are too many to name. */
export function upsetRightText(u: Pick<Upset, 'correctCount' | 'correctNames'>): string | null {
  if (u.correctCount === 0) return 'Nobody picked it';
  if (!u.correctNames) return null;
  return `Only ${entriesLabel(u.correctCount)} picked it (${joinNames(u.correctNames)})`;
}

export interface WinnerBanner {
  title: string;
  names: string;
  detail: string;
}

/** Banner copy for the final recap. `winners` are the rank-1 entries (all share `correct`). */
export function winnerBanner(
  weekNumber: number,
  winners: { name: string; correct: number }[],
  gamesTotal: number,
): WinnerBanner | null {
  if (winners.length === 0) return null;
  const correct = `${winners[0].correct} of ${gamesTotal} correct`;
  if (winners.length === 1) {
    return { title: `Week ${weekNumber} winner`, names: winners[0].name, detail: `${correct} · outright win` };
  }
  return {
    title: `Week ${weekNumber} co-winners`,
    names: joinNames(winners.map((w) => w.name)),
    detail: `${correct} · tied, co-winners`,
  };
}

export type PickResult = 'right' | 'wrong' | 'tie' | 'pending' | 'void' | 'none';

/** One mark per game in kickoff order for a compact pick strip: right / wrong / tie (no point) / pending / void. */
export function pickResults(
  games: Pick<ScoringGame, 'id' | 'kickoffAt' | 'status' | 'winner'>[],
  picks: Record<number, Side>,
): { gameId: number; result: PickResult }[] {
  return [...games]
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.id - b.id)
    .map((g) => {
      const p = picks[g.id];
      let result: PickResult;
      if (g.status === 'void') result = 'void';
      else if (!p) result = 'none';
      else if (g.status !== 'final' || g.winner === null) result = 'pending';
      else if (g.winner === 'tie') result = 'tie';
      else result = p === g.winner ? 'right' : 'wrong';
      return { gameId: g.id, result };
    });
}

export { avatarColors, initial } from './avatar';
