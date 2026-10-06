import { formatMoney } from './pot';

/** Season stats types, sort order and labels (pure, client-safe: no server imports). Computed in season.ts. */

export interface BestWeek {
  weekId: number;
  weekNumber: number;
  correct: number;
  total: number;
  /** 0..1 */
  pct: number;
}

export interface SeasonRow {
  userId: number;
  name: string;
  /** Completed weeks with at least one counted entry. */
  weeks: number;
  /** Counted entries over the season (a player may have several a week). */
  entries: number;
  correct: number;
  /** Graded picks: correct + wrong (void games excluded; a tied game counts as a miss, as in the weekly score). */
  graded: number;
  /** correct / graded (0..1), null with nothing graded. */
  pct: number | null;
  /** The best single entry-week by percent correct (then more correct, then the earlier week). */
  best: BestWeek | null;
  /** Weeks won (a shared 1st counts as a win; two winning entries in one week still count once). */
  wins: number;
  /** Weeks with an entry finishing in the top 3 (by rank, shared ranks included). */
  top3: number;
  /** Mean |tiebreaker guess - actual total| over counted entries whose tiebreaker game finished with a score. */
  avgTbDiff: number | null;
  /** Pot shares won (co-winners split, rounded down to the cent). */
  winningsCents: number;
  /** Fees for this player's counted entries. */
  feesCents: number;
  netCents: number;
}

export type SeasonSortKey = 'pct' | 'wins' | 'correct' | 'best' | 'tb' | 'top3' | 'weeks' | 'net';

/** Each key's natural direction: lower is better only for the tiebreaker distance. */
export const SORT_ASCENDING: Record<SeasonSortKey, boolean> = {
  pct: false,
  wins: false,
  correct: false,
  best: false,
  tb: true,
  top3: false,
  weeks: false,
  net: false,
};

const sortValue = (r: SeasonRow, key: SeasonSortKey): number | null => {
  switch (key) {
    case 'pct':
      return r.pct;
    case 'wins':
      return r.wins;
    case 'correct':
      return r.correct;
    case 'best':
      return r.best?.pct ?? null;
    case 'tb':
      return r.avgTbDiff;
    case 'top3':
      return r.top3;
    case 'weeks':
      return r.weeks;
    case 'net':
      return r.netCents;
  }
};

/**
 * Orders two rows by `key` (best first in its natural direction, or flipped with `reverse`). Missing values
 * always sort last. Ties fall back to percent, then wins, then correct, then name.
 */
export function compareRows(a: SeasonRow, b: SeasonRow, key: SeasonSortKey, reverse = false): number {
  const by = (k: SeasonSortKey, flip: boolean) => {
    const x = sortValue(a, k);
    const y = sortValue(b, k);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const d = SORT_ASCENDING[k] ? x - y : y - x;
    return flip ? -d : d;
  };
  return (
    by(key, reverse) ||
    by('pct', false) ||
    by('wins', false) ||
    by('correct', false) ||
    a.name.localeCompare(b.name, undefined, { numeric: true }) ||
    a.userId - b.userId
  );
}

/** "68.4%" (one decimal). */
export const pct1 = (p: number) => `${(Math.round(p * 1000) / 10).toFixed(1)}%`;
/** "94%" (whole). */
export const pct0 = (p: number) => `${Math.round(p * 100)}%`;
/** "±3.5" average tiebreaker distance. */
export const tbAvgLabel = (d: number) => `±${(Math.round(d * 10) / 10).toFixed(1)}`;

/** "+$30", "−$10", "$0". */
export function netLabel(cents: number): string {
  const money = formatMoney(Math.abs(cents));
  return cents > 0 ? `+${money}` : cents < 0 ? `−${money}` : money;
}

/** "Weeks 1–5", "Weeks 1–3, 5", "Week 2". */
export function weeksCountedLabel(weekNumbers: number[]): string {
  if (weekNumbers.length === 0) return 'No weeks';
  const nums = [...weekNumbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of [...nums.slice(1), NaN]) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = n;
  }
  return `${nums.length === 1 ? 'Week' : 'Weeks'} ${parts.join(', ')}`;
}
