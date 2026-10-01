import { describe, expect, it } from 'vitest';
import {
  rankEntries,
  scoreEntry,
  tiebreakerGame,
  weekSummary,
  type ScoringEntry,
  type ScoringGame,
} from './scoring';

const T = (iso: string) => new Date(iso);

function game(id: number, kickoff: string, over: Partial<ScoringGame> = {}): ScoringGame {
  return { id, kickoffAt: T(kickoff), homeTeam: `H${id}`, awayTeam: `A${id}`, homeScore: null, awayScore: null, status: 'scheduled', winner: null, ...over };
}
const fin = (id: number, kickoff: string, h: number, a: number) =>
  game(id, kickoff, { homeScore: h, awayScore: a, status: 'final', winner: h === a ? 'tie' : h > a ? 'home' : 'away' });

function entry(userId: number, name: string, picks: Record<number, 'home' | 'away'>, tiebreaker = 40, paid = true): ScoringEntry {
  return { userId, name, paid, tiebreaker, picks };
}

// Thu (PT), Sun, Mon night PT (2026-10-13T00:20Z = Mon 5:20 PM PDT)
const THU = '2026-10-09T00:15:00Z';
const SUN = '2026-10-11T17:00:00Z';
const MON = '2026-10-13T00:20:00Z';

describe('tiebreakerGame', () => {
  it('is the last Monday-PT game', () => {
    const gs = [game(1, THU), game(2, SUN), game(3, '2026-10-12T20:00:00Z'), game(4, MON)];
    expect(tiebreakerGame(gs)?.id).toBe(4);
  });
  it('uses PT, not UTC, for Monday (Mon 5pm PT is Tue UTC)', () => {
    expect(ptMon('2026-10-13T00:20:00Z')).toBe(true);
  });
  it('falls back to the last game when there is no Monday game', () => {
    const gs = [game(1, THU), game(2, SUN), game(3, '2026-10-11T20:25:00Z')];
    expect(tiebreakerGame(gs)?.id).toBe(3);
  });
  it('ignores a Sunday-night-PT game that is Monday in UTC', () => {
    // Sun 6pm PT = Mon 01:00Z; Monday PT game earlier in the day should not be shadowed by it
    const gs = [game(1, '2026-10-12T01:00:00Z'), game(2, '2026-10-12T20:00:00Z')];
    expect(tiebreakerGame(gs)?.id).toBe(2);
  });
  it('null for no games; ties on kickoff pick the highest id', () => {
    expect(tiebreakerGame([])).toBeNull();
    expect(tiebreakerGame([game(1, MON), game(2, MON)])?.id).toBe(2);
  });
});

function ptMon(iso: string) {
  return tiebreakerGame([game(1, SUN), game(2, iso)])?.id === 2;
}

describe('scoreEntry', () => {
  const gs = [fin(1, THU, 27, 24), fin(2, SUN, 10, 20), fin(3, SUN, 17, 17), game(4, MON)];
  it('counts correct / wrong / pending; a tie game gives nobody the point', () => {
    const s = scoreEntry(gs, entry(1, 'A', { 1: 'home', 2: 'home', 3: 'home', 4: 'away' }));
    expect(s).toMatchObject({ correct: 1, wrong: 2, pending: 1, counted: true, tiebreakerDiff: null });
    const s2 = scoreEntry(gs, entry(2, 'B', { 1: 'away', 2: 'away', 3: 'away', 4: 'home' }));
    expect(s2).toMatchObject({ correct: 1, wrong: 2, pending: 1 });
  });
  it('final game without a winner stays pending; missing pick on final is wrong', () => {
    const odd = [game(1, THU, { status: 'final', winner: null }), fin(2, SUN, 3, 0)];
    expect(scoreEntry(odd, entry(1, 'A', { 1: 'home' }))).toMatchObject({ correct: 0, wrong: 1, pending: 1 });
  });
  it('tiebreakerDiff is absolute and only once the tiebreaker game is final', () => {
    const done = [fin(1, THU, 20, 10), fin(2, MON, 24, 20)]; // total 44
    expect(scoreEntry(done, entry(1, 'A', {}, 50)).tiebreakerDiff).toBe(6);
    expect(scoreEntry(done, entry(1, 'A', {}, 40)).tiebreakerDiff).toBe(4);
    expect(scoreEntry([fin(1, THU, 20, 10), game(2, MON)], entry(1, 'A', {}, 40)).tiebreakerDiff).toBeNull();
  });
  it('marks unpaid as not counted', () => {
    expect(scoreEntry(gs, entry(1, 'A', {}, 0, false)).counted).toBe(false);
  });
});

describe('rankEntries', () => {
  it('ranks only paid entries by correct desc', () => {
    const gs = [fin(1, THU, 3, 0), fin(2, SUN, 3, 0), game(3, MON)];
    const r = rankEntries(gs, [
      entry(1, 'Ann', { 1: 'home', 2: 'away' }),
      entry(2, 'Bob', { 1: 'home', 2: 'home' }),
      entry(3, 'Cy', { 1: 'home', 2: 'home' }, 0, false),
    ]);
    expect(r.map((e) => [e.name, e.rank, e.tied])).toEqual([['Bob', 1, false], ['Ann', 2, false]]);
  });
  it('shares ranks with competition numbering (1,1,3) while the tiebreaker game is not final', () => {
    const gs = [fin(1, THU, 3, 0), game(2, MON)];
    const r = rankEntries(gs, [
      entry(1, 'A', { 1: 'home' }, 10),
      entry(2, 'B', { 1: 'home' }, 99),
      entry(3, 'C', { 1: 'away' }),
    ]);
    expect(r.map((e) => [e.rank, e.tied])).toEqual([[1, true], [1, true], [3, false]]);
  });
  it('applies the tiebreaker once the tiebreaker game is final (over and under equal)', () => {
    const gs = [fin(1, THU, 3, 0), fin(2, MON, 20, 24)]; // 44
    const pk = { 1: 'home' as const, 2: 'home' as const };
    const r = rankEntries(gs, [
      entry(1, 'Over', pk, 50), // diff 6
      entry(2, 'Under', pk, 38), // diff 6
      entry(3, 'Close', pk, 43), // diff 1
      entry(4, 'Far', pk, 0), // diff 44
    ]);
    expect(r.map((e) => [e.name, e.rank, e.tied, e.tiebreakerDiff])).toEqual([
      ['Close', 1, false, 1],
      ['Over', 2, true, 6],
      ['Under', 2, true, 6],
      ['Far', 4, false, 44],
    ]);
  });
  it('more correct beats a better tiebreaker', () => {
    const gs = [fin(1, THU, 3, 0), fin(2, MON, 20, 24)];
    const r = rankEntries(gs, [
      entry(1, 'Exact', { 1: 'away', 2: 'home' }, 44),
      entry(2, 'Far', { 1: 'home', 2: 'home' }, 0),
    ]);
    expect(r.map((e) => e.name)).toEqual(['Far', 'Exact']);
  });
  it('returns [] with no counted entries', () => {
    expect(rankEntries([game(1, THU)], [entry(1, 'A', {}, 0, false)])).toEqual([]);
  });
});

describe('weekSummary', () => {
  const gs = [fin(1, THU, 27, 24), fin(2, SUN, 10, 20), fin(3, SUN, 17, 17), fin(4, MON, 21, 20)]; // tb total 41
  const entries = [
    entry(1, 'Ann', { 1: 'home', 2: 'away', 3: 'home', 4: 'home' }, 41), // 3 correct, diff 0
    entry(2, 'Bob', { 1: 'home', 2: 'home', 3: 'away', 4: 'home' }, 45), // 2 correct
    entry(3, 'Cy', { 1: 'away', 2: 'home', 3: 'home', 4: 'away' }, 30), // 0 correct
    entry(4, 'Dee', { 1: 'home', 2: 'away', 3: 'home', 4: 'away' }, 41, false), // unpaid, 2 correct
  ];
  const s = weekSummary(gs, entries);

  it('counts games and finality', () => {
    expect(s).toMatchObject({ gamesFinal: 4, gamesTotal: 4, isFinal: true, tiebreakerGameId: 4, tiebreakerActualTotal: 41 });
  });
  it('winners are rank-1 entries when final', () => {
    expect(s.winners.map((w) => w.name)).toEqual(['Ann']);
  });
  it('co-winners when fully tied', () => {
    const w = weekSummary(gs, [entry(1, 'A', { 1: 'home' }, 40), entry(2, 'B', { 1: 'home' }, 42)]);
    expect(w.winners.map((x) => x.name)).toEqual(['A', 'B']);
    expect(w.winners.every((x) => x.tied)).toBe(true);
  });
  it('no winners until the week is final', () => {
    const w = weekSummary([fin(1, THU, 3, 0), game(2, MON)], [entry(1, 'A', { 1: 'home' })]);
    expect(w.isFinal).toBe(false);
    expect(w.winners).toEqual([]);
  });
  it('stats use counted entries only', () => {
    expect(s.stats).toEqual({
      mostCorrect: { correct: 3, names: ['Ann'] },
      fewestCorrect: { correct: 0, names: ['Cy'] },
      average: 1.7,
      countedEntries: 3,
    });
  });
  it('splits count paid entries only', () => {
    expect(s.splits[1]).toEqual({ home: 2, away: 1 });
    expect(s.splits[2]).toEqual({ home: 2, away: 1 });
  });
  it('lists unpaid entries separately with their correct count', () => {
    expect(s.notCounted).toHaveLength(1);
    expect(s.notCounted[0]).toMatchObject({ name: 'Dee', correct: 2, counted: false });
    expect(s.ranked.map((r) => r.name)).not.toContain('Dee');
  });
  it('upset: final non-tie game most counted players got wrong', () => {
    // game1 winner home: Cy wrong (1). game2 winner away: Bob, Cy wrong (2). game4 winner home: Cy wrong (1)
    expect(s.upset).toEqual({ gameId: 2, wrongCount: 2, totalCount: 3, correctCount: 1, correctNames: ['Ann'] });
  });
  it('upset ignores tie games and pending games; null when nobody is wrong', () => {
    const only = weekSummary([fin(1, THU, 3, 3), game(2, MON)], [entry(1, 'A', { 1: 'home', 2: 'home' })]);
    expect(only.upset).toBeNull();
    const allRight = weekSummary([fin(1, THU, 3, 0)], [entry(1, 'A', { 1: 'home' })]);
    expect(allRight.upset).toBeNull();
  });
  it('upset tiebreaks: higher wrong fraction, then latest kickoff; names hidden above 3', () => {
    const g = [fin(1, THU, 3, 0), fin(2, SUN, 3, 0)];
    const e = [
      entry(1, 'A', { 1: 'away', 2: 'away' }),
      entry(2, 'B', { 1: 'home', 2: 'home' }),
      entry(3, 'C', { 1: 'home', 2: 'home' }),
      entry(4, 'D', { 1: 'home', 2: 'home' }),
      entry(5, 'E', { 1: 'home', 2: 'home' }),
    ];
    const u = weekSummary(g, e).upset;
    expect(u).toMatchObject({ gameId: 2, wrongCount: 1, totalCount: 5, correctCount: 4, correctNames: null }); // later kickoff
    // fraction: game 1 has 1 of 5 wrong; game 2 has 1 of 2 wrong (only 2 picked it)
    const e2 = [entry(1, 'A', { 1: 'away' }), entry(2, 'B', { 1: 'home' }), entry(3, 'C', { 1: 'home' }), entry(4, 'D', { 1: 'home' }), entry(5, 'E', { 1: 'home' }), ];
    e2[0].picks[2] = 'away';
    e2[1].picks[2] = 'home';
    for (const x of e2.slice(2)) delete x.picks[2];
    expect(weekSummary(g, e2).upset).toMatchObject({ gameId: 2, wrongCount: 1, totalCount: 2, correctNames: ['B'] });
  });
  it('is safe with no entries', () => {
    const w = weekSummary(gs, []);
    expect(w.stats).toBeNull();
    expect(w.ranked).toEqual([]);
    expect(w.upset).toBeNull();
    expect(w.winners).toEqual([]);
  });
});
