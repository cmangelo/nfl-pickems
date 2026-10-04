import type { RankedEntry, ScoringEntry, ScoringGame, WeekSummary } from './scoring';

/**
 * Weekly report extras for the final recap (pure). Only counted (paid) entries take part, like the ranking.
 * Every award is null when it does not apply, and the page simply leaves that card out.
 */

export interface PodiumStep {
  rank: number;
  tied: boolean;
  entries: { entryId: number; userId: number; name: string }[];
  correct: number;
}

/** Up to three podium steps by distinct rank (1, 1, 3 => a shared 1st and a 3rd), only ranks 1..3. */
export function podium(ranked: RankedEntry[]): PodiumStep[] {
  const steps: PodiumStep[] = [];
  for (const e of ranked) {
    if (e.rank > 3) break;
    const last = steps[steps.length - 1];
    const item = { entryId: e.entryId, userId: e.userId, name: e.name };
    if (last && last.rank === e.rank) last.entries.push(item);
    else steps.push({ rank: e.rank, tied: e.tied, entries: [item], correct: e.correct });
  }
  return steps;
}

export interface GameAward {
  gameId: number;
  /** Counted entries that picked the game, and how many got it right. */
  pickers: number;
  right: number;
}

export interface SplitAward extends GameAward {
  home: number;
  away: number;
}

export interface BlowoutAward {
  gameId: number;
  margin: number;
}

export interface NamesAward {
  names: string[];
}

export interface ClosestTiebreaker extends NamesAward {
  diff: number;
}

export interface BadBeat extends NamesAward {
  correct: number;
  /** How much further their tiebreaker guess was than the winner's. */
  behindBy: number;
}

export interface Contrarian extends NamesAward {
  /** Picks on the side fewer counted entries took. */
  against: number;
  /** How many of those came in. */
  hits: number;
}

export interface WeekReport {
  podium: PodiumStep[];
  /** Settled game the largest share got right (the "lock of the week"). */
  lock: GameAward | null;
  /** Settled game whose pick split was closest to even. */
  coinFlip: SplitAward | null;
  /** Biggest final margin. */
  blowout: BlowoutAward | null;
  closestTiebreaker: ClosestTiebreaker | null;
  /** Level with the winner on correct picks, beaten on the tiebreaker. */
  badBeat: BadBeat | null;
  contrarian: Contrarian | null;
}

const decided = (g: ScoringGame) => g.status === 'final' && (g.winner === 'home' || g.winner === 'away');
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function weekReport(games: ScoringGame[], entries: ScoringEntry[], summary: WeekSummary): WeekReport {
  const counted = entries.filter((e) => e.paid);
  const later = (a: ScoringGame, b: ScoringGame) => a.kickoffAt.getTime() > b.kickoffAt.getTime() || (a.kickoffAt.getTime() === b.kickoffAt.getTime() && a.id > b.id);

  // Lock: highest right share, then more right, then latest kickoff. Never the upset game.
  let lock: (GameAward & { g: ScoringGame }) | null = null;
  for (const g of games) {
    if (!decided(g) || g.id === summary.upset?.gameId) continue;
    const pickers = counted.filter((e) => e.picks[g.id] !== undefined).length;
    if (pickers === 0) continue;
    const right = counted.filter((e) => e.picks[g.id] === g.winner).length;
    if (right === 0) continue;
    const c = { gameId: g.id, pickers, right, g };
    const share = right / pickers;
    const best = lock ? lock.right / lock.pickers : -1;
    if (!lock || share > best || (share === best && (right > lock.right || (right === lock.right && later(g, lock.g))))) lock = c;
  }

  // Coin flip: smallest gap between the two sides (both picked), then more pickers, then latest kickoff.
  let coinFlip: (SplitAward & { g: ScoringGame }) | null = null;
  for (const g of games) {
    if (!decided(g) || g.id === summary.upset?.gameId || g.id === lock?.gameId) continue;
    const s = summary.splits[g.id];
    if (!s || s.home === 0 || s.away === 0) continue;
    const gap = Math.abs(s.home - s.away) / (s.home + s.away);
    const c = { gameId: g.id, pickers: s.home + s.away, right: g.winner === 'home' ? s.home : s.away, home: s.home, away: s.away, g };
    const bestGap = coinFlip ? Math.abs(coinFlip.home - coinFlip.away) / coinFlip.pickers : 2;
    if (!coinFlip || gap < bestGap || (gap === bestGap && (c.pickers > coinFlip.pickers || (c.pickers === coinFlip.pickers && later(g, coinFlip.g))))) coinFlip = c;
  }

  // Blowout: biggest final margin (ties: latest kickoff).
  let blowout: (BlowoutAward & { g: ScoringGame }) | null = null;
  for (const g of games) {
    if (!decided(g) || g.homeScore === null || g.awayScore === null) continue;
    const margin = Math.abs(g.homeScore - g.awayScore);
    if (!blowout || margin > blowout.margin || (margin === blowout.margin && later(g, blowout.g))) blowout = { gameId: g.id, margin, g };
  }

  const ranked = summary.ranked;
  const withDiff = ranked.filter((e) => e.tiebreakerDiff !== null);
  let closestTiebreaker: ClosestTiebreaker | null = null;
  if (withDiff.length > 0) {
    const diff = Math.min(...withDiff.map((e) => e.tiebreakerDiff!));
    closestTiebreaker = { diff, names: withDiff.filter((e) => e.tiebreakerDiff === diff).map((e) => e.name).sort(byName) };
  }

  let badBeat: BadBeat | null = null;
  const top = summary.winners[0];
  if (top && top.tiebreakerDiff !== null) {
    const beaten = ranked.filter((e) => e.rank > 1 && e.correct === top.correct && e.tiebreakerDiff !== null);
    if (beaten.length > 0) {
      const diff = Math.min(...beaten.map((e) => e.tiebreakerDiff!));
      badBeat = {
        correct: top.correct,
        behindBy: diff - top.tiebreakerDiff,
        names: beaten.filter((e) => e.tiebreakerDiff === diff).map((e) => e.name).sort(byName),
      };
    }
  }

  // Contrarian: most picks on the minority side of a non-void game (an even split has no minority).
  let contrarian: Contrarian | null = null;
  if (counted.length >= 3) {
    const rows = counted.map((e) => {
      let against = 0;
      let hits = 0;
      for (const g of games) {
        if (g.status === 'void') continue;
        const s = summary.splits[g.id];
        const p = e.picks[g.id];
        if (!s || !p || s.home === s.away) continue;
        const minority = s.home < s.away ? 'home' : 'away';
        if (p !== minority) continue;
        against++;
        if (decided(g) && g.winner === p) hits++;
      }
      return { name: e.name, against, hits };
    });
    const most = Math.max(...rows.map((r) => r.against));
    if (most > 0) {
      const top2 = rows.filter((r) => r.against === most);
      const hits = Math.max(...top2.map((r) => r.hits));
      const names = top2.filter((r) => r.hits === hits).map((r) => r.name).sort(byName);
      contrarian = { names, against: most, hits };
    }
  }

  const strip = <T extends { g: ScoringGame }>(x: T | null) => {
    if (!x) return null;
    const { g: _g, ...rest } = x;
    void _g;
    return rest;
  };
  return {
    podium: podium(ranked),
    lock: strip(lock),
    coinFlip: strip(coinFlip),
    blowout: strip(blowout),
    closestTiebreaker,
    badBeat,
    contrarian,
  };
}

/** "92%": share of `n` in `total`, rounded. */
export function percent(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}
