import { ptDayOfWeek } from './time';

export type Side = 'home' | 'away';

export interface ScoringGame {
  id: number;
  kickoffAt: Date;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  /** 'postponed' counts as pending; 'void' counts for nobody (excluded from correct/wrong/total). */
  status: 'scheduled' | 'final' | 'postponed' | 'void';
  winner: 'home' | 'away' | 'tie' | null;
}

export interface ScoringEntry {
  userId: number;
  name: string;
  paid: boolean;
  tiebreaker: number;
  picks: Record<number, Side>;
}

export interface ScoredEntry {
  userId: number;
  name: string;
  paid: boolean;
  tiebreaker: number;
  picks: Record<number, Side>;
  correct: number;
  /** Settled with no point: a wrong pick, or any pick on a game that ended in a tie. */
  wrong: number;
  pending: number;
  /** Counted toward ranking/stats = paid. */
  counted: boolean;
  /** |guess - actual total| once the tiebreaker game is final, else null. */
  tiebreakerDiff: number | null;
}

export interface RankedEntry extends ScoredEntry {
  rank: number;
  /** Shares its rank with at least one other entry ("T-1st"). */
  tied: boolean;
}

const isSettled = (g: ScoringGame) => g.status === 'final' && g.winner !== null;
const isVoid = (g: Pick<ScoringGame, 'status'>) => g.status === 'void';

/**
 * The tiebreaker game: the last-kicking-off game on Monday (PT) of the week;
 * if there is no Monday game, the last game of the week. Null for an empty week.
 */
export function tiebreakerGame<T extends Pick<ScoringGame, 'id' | 'kickoffAt'>>(games: T[]): T | null {
  if (games.length === 0) return null;
  const latest = (list: T[]) =>
    list.reduce((a, b) => {
      const d = b.kickoffAt.getTime() - a.kickoffAt.getTime();
      return d > 0 || (d === 0 && b.id > a.id) ? b : a;
    });
  const monday = games.filter((g) => ptDayOfWeek(g.kickoffAt) === 1);
  return latest(monday.length ? monday : games);
}

/**
 * Actual combined score of the tiebreaker game, once it is final. `tiebreakerGameId` (the game frozen
 * at the lock) wins over the computed one; a void tiebreaker game yields no total.
 */
export function actualTiebreakerTotal(games: ScoringGame[], tiebreakerGameId?: number | null): number | null {
  const g = (tiebreakerGameId != null ? games.find((x) => x.id === tiebreakerGameId) : undefined) ?? tiebreakerGame(games);
  if (!g || g.status !== 'final' || g.homeScore === null || g.awayScore === null) return null;
  return g.homeScore + g.awayScore;
}

export function scoreEntry(games: ScoringGame[], entry: ScoringEntry, tiebreakerGameId?: number | null): ScoredEntry {
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  for (const g of games) {
    if (isVoid(g)) continue;
    if (!isSettled(g)) {
      pending++;
      continue;
    }
    if (g.winner !== 'tie' && entry.picks[g.id] === g.winner) correct++;
    else wrong++;
  }
  const total = actualTiebreakerTotal(games, tiebreakerGameId);
  return {
    ...entry,
    correct,
    wrong,
    pending,
    counted: entry.paid,
    tiebreakerDiff: total === null ? null : Math.abs(entry.tiebreaker - total),
  };
}

/**
 * Ranks counted (paid) entries: correct desc, then (only once the tiebreaker game is final)
 * tiebreaker diff asc. Equal on both => shared rank (competition ranking 1,1,3), `tied` set.
 */
export function rankEntries(games: ScoringGame[], entries: ScoringEntry[], tiebreakerGameId?: number | null): RankedEntry[] {
  const scored = entries.map((e) => scoreEntry(games, e, tiebreakerGameId)).filter((e) => e.counted);
  scored.sort(
    (a, b) =>
      b.correct - a.correct ||
      (a.tiebreakerDiff ?? 0) - (b.tiebreakerDiff ?? 0) ||
      a.name.localeCompare(b.name) ||
      a.userId - b.userId,
  );
  const sameRank = (a: ScoredEntry, b: ScoredEntry) =>
    a.correct === b.correct && (a.tiebreakerDiff ?? 0) === (b.tiebreakerDiff ?? 0);
  const out: RankedEntry[] = [];
  scored.forEach((e, i) => {
    const rank = i > 0 && sameRank(scored[i - 1], e) ? out[i - 1].rank : i + 1;
    out.push({ ...e, rank, tied: false });
  });
  for (const e of out) e.tied = out.filter((o) => o.rank === e.rank).length > 1;
  return out;
}

export interface GameSplit {
  home: number;
  away: number;
}

export interface Upset {
  gameId: number;
  wrongCount: number;
  /** Counted entries that picked this game. */
  totalCount: number;
  correctCount: number;
  /** Names of those who got it right, only when there are 3 or fewer (else null). */
  correctNames: string[] | null;
}

export interface WeekStats {
  mostCorrect: { correct: number; names: string[] };
  fewestCorrect: { correct: number; names: string[] };
  /** Mean of correct picks over counted entries, rounded to 1 decimal. */
  average: number;
  countedEntries: number;
}

export interface WeekSummary {
  gamesFinal: number;
  /** Games that count: void games are excluded. */
  gamesTotal: number;
  /** Every game is final or void (and there is at least one). */
  isFinal: boolean;
  ranked: RankedEntry[];
  /** Unpaid entries, with their correct counts; excluded from ranking, stats and splits. */
  notCounted: ScoredEntry[];
  /** Rank-1 entries once the week is final (co-winners); empty before then. */
  winners: RankedEntry[];
  stats: WeekStats | null;
  /** Pick counts per game over counted (paid) entries only. */
  splits: Record<number, GameSplit>;
  upset: Upset | null;
  tiebreakerGameId: number | null;
  tiebreakerActualTotal: number | null;
}

export function weekSummary(
  games: ScoringGame[],
  entries: ScoringEntry[],
  { tiebreakerGameId = null }: { tiebreakerGameId?: number | null } = {},
): WeekSummary {
  const ranked = rankEntries(games, entries, tiebreakerGameId);
  const notCounted = entries
    .filter((e) => !e.paid)
    .map((e) => scoreEntry(games, e, tiebreakerGameId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const playable = games.filter((g) => !isVoid(g));
  const gamesFinal = playable.filter((g) => g.status === 'final').length;
  const isFinal = games.length > 0 && gamesFinal === playable.length;
  const counted = entries.filter((e) => e.paid);

  const splits: Record<number, GameSplit> = {};
  for (const g of games) {
    const s = { home: 0, away: 0 };
    for (const e of counted) {
      const p = e.picks[g.id];
      if (p === 'home') s.home++;
      else if (p === 'away') s.away++;
    }
    splits[g.id] = s;
  }

  let stats: WeekStats | null = null;
  if (ranked.length > 0) {
    const max = Math.max(...ranked.map((e) => e.correct));
    const min = Math.min(...ranked.map((e) => e.correct));
    const sum = ranked.reduce((a, e) => a + e.correct, 0);
    const names = (n: number) => ranked.filter((e) => e.correct === n).map((e) => e.name);
    stats = {
      mostCorrect: { correct: max, names: names(max) },
      fewestCorrect: { correct: min, names: names(min) },
      average: Math.round((sum / ranked.length) * 10) / 10,
      countedEntries: ranked.length,
    };
  }

  let upset: (Upset & { frac: number; kickoff: number }) | null = null;
  for (const g of games) {
    if (!isSettled(g) || g.winner === 'tie') continue;
    const pickers = counted.filter((e) => e.picks[g.id] !== undefined);
    const right = pickers.filter((e) => e.picks[g.id] === g.winner);
    const wrongCount = pickers.length - right.length;
    if (wrongCount === 0) continue;
    const cand = {
      gameId: g.id,
      wrongCount,
      totalCount: pickers.length,
      correctCount: right.length,
      correctNames: right.length <= 3 ? right.map((e) => e.name).sort((a, b) => a.localeCompare(b)) : null,
      frac: wrongCount / pickers.length,
      kickoff: g.kickoffAt.getTime(),
    };
    if (
      !upset ||
      cand.wrongCount > upset.wrongCount ||
      (cand.wrongCount === upset.wrongCount &&
        (cand.frac > upset.frac || (cand.frac === upset.frac && cand.kickoff > upset.kickoff)))
    ) {
      upset = cand;
    }
  }

  const tb = (tiebreakerGameId != null ? games.find((g) => g.id === tiebreakerGameId) : undefined) ?? tiebreakerGame(games);
  return {
    gamesFinal,
    gamesTotal: playable.length,
    isFinal,
    ranked,
    notCounted,
    winners: isFinal ? ranked.filter((e) => e.rank === 1) : [],
    stats,
    splits,
    upset: upset ? { gameId: upset.gameId, wrongCount: upset.wrongCount, totalCount: upset.totalCount, correctCount: upset.correctCount, correctNames: upset.correctNames } : null,
    tiebreakerGameId: tb?.id ?? null,
    tiebreakerActualTotal: actualTiebreakerTotal(games, tiebreakerGameId),
  };
}
