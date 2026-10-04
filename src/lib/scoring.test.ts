import { describe, expect, it } from 'vitest';
import {
  eliminatedEntryIds,
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

function entry(userId: number, name: string, picks: Record<number, 'home' | 'away'>, tiebreaker = 40, paid = true, entryId = userId): ScoringEntry {
  return { entryId, userId, name, paid, tiebreaker, picks };
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

describe('void and postponed games', () => {
  const gs = [
    fin(1, THU, 20, 10), // home won
    game(2, SUN, { status: 'void' }),
    game(3, SUN, { status: 'postponed' }),
    game(4, MON), // scheduled
  ];
  const e = entry(1, 'Ann', { 1: 'home', 2: 'home', 3: 'home', 4: 'home' });

  it('void counts for nobody; postponed is pending', () => {
    expect(scoreEntry(gs, e)).toMatchObject({ correct: 1, wrong: 0, pending: 2 });
  });

  it('a void game is excluded from the total and from the final check; splits still reported', () => {
    const sum = weekSummary(gs, [e, entry(2, 'Bob', { 1: 'away', 2: 'away', 3: 'away', 4: 'away' })]);
    expect(sum.gamesTotal).toBe(3);
    expect(sum.gamesFinal).toBe(1);
    expect(sum.isFinal).toBe(false);
    expect(sum.splits[2]).toEqual({ home: 1, away: 1 });
    const done = weekSummary(
      [fin(1, THU, 20, 10), game(2, SUN, { status: 'void' })],
      [entry(1, 'Ann', { 1: 'home', 2: 'home' })],
    );
    expect(done).toMatchObject({ isFinal: true, gamesTotal: 1, gamesFinal: 1 });
    expect(done.ranked[0]).toMatchObject({ correct: 1, wrong: 0, pending: 0 });
  });

  it('a void game is never the upset', () => {
    const sum = weekSummary([game(1, THU, { status: 'void', winner: 'home' })], [entry(1, 'Ann', { 1: 'away' })]);
    expect(sum.upset).toBeNull();
  });

  it('the frozen tiebreaker game id wins over the computed one', () => {
    const g = [fin(1, SUN, 20, 10), fin(2, MON, 30, 20)];
    const es = [entry(1, 'Ann', { 1: 'home', 2: 'home' }, 30), entry(2, 'Bob', { 1: 'home', 2: 'home' }, 50)];
    expect(weekSummary(g, es).tiebreakerActualTotal).toBe(50);
    const frozen = weekSummary(g, es, { tiebreakerGameId: 1 });
    expect(frozen.tiebreakerGameId).toBe(1);
    expect(frozen.tiebreakerActualTotal).toBe(30);
    expect(frozen.ranked.map((r) => r.name)).toEqual(['Ann', 'Bob']);
  });
});

describe('several entries from one player', () => {
  const gs = [fin(1, THU, 20, 10), fin(2, SUN, 10, 20), fin(3, MON, 21, 24)]; // home, away, away; total 45
  // Ann has three entries: two paid, one unpaid. Bob has one.
  const es = [
    entry(1, 'Ann (1)', { 1: 'home', 2: 'away', 3: 'away' }, 45, true, 11),
    entry(1, 'Ann (2)', { 1: 'away', 2: 'away', 3: 'away' }, 40, true, 12),
    entry(1, 'Ann (3)', { 1: 'away', 2: 'home', 3: 'home' }, 40, false, 13),
    entry(2, 'Bob', { 1: 'home', 2: 'away', 3: 'home' }, 52, true, 20),
  ];

  it('ranks each paid entry on its own; unpaid ones are not counted', () => {
    const s = weekSummary(gs, es);
    expect(s.ranked.map((e) => [e.entryId, e.name, e.correct, e.rank])).toEqual([
      [11, 'Ann (1)', 3, 1],
      [12, 'Ann (2)', 2, 2],
      [20, 'Bob', 2, 3], // same correct as Ann (2), farther from 45
    ]);
    expect(s.notCounted.map((e) => e.entryId)).toEqual([13]);
    expect(s.winners.map((e) => e.name)).toEqual(['Ann (1)']);
    expect(s.stats?.countedEntries).toBe(3);
  });

  it('counts every paid entry in the splits', () => {
    const s = weekSummary(gs, es);
    expect(s.splits[1]).toEqual({ home: 2, away: 1 });
    expect(s.splits[3]).toEqual({ home: 1, away: 2 });
  });

  it('two entries of one player can share a rank (co-winners)', () => {
    const twins = [es[0], { ...es[1], picks: es[0].picks, tiebreaker: 45 }];
    const r = rankEntries(gs, twins);
    expect(r.map((e) => [e.entryId, e.rank, e.tied])).toEqual([[11, 1, true], [12, 1, true]]);
  });
});

describe('entry labels sort numerically within a tie', () => {
  it('"Ann (2)" before "Ann (10)"', () => {
    const gs = [fin(1, THU, 20, 10)];
    const es = [entry(1, 'Ann (10)', { 1: 'home' }, 40, true, 20), entry(1, 'Ann (2)', { 1: 'home' }, 40, true, 12)];
    expect(rankEntries(gs, es).map((e) => e.name)).toEqual(['Ann (2)', 'Ann (10)']);
    const unpaid = es.map((e) => ({ ...e, paid: false }));
    expect(weekSummary(gs, unpaid).notCounted.map((e) => e.name)).toEqual(['Ann (2)', 'Ann (10)']);
  });
});

describe('eliminatedEntryIds', () => {
  const H = 'home' as const;
  const A = 'away' as const;
  // Games 1-2 final (home won both), 3-4 pending; 4 is the Monday tiebreaker game.
  const live = [fin(1, THU, 20, 10), fin(2, SUN, 24, 17), game(3, SUN), game(4, MON)];

  it('out when even winning every pending pick cannot catch the leader', () => {
    const es = [
      entry(1, 'Ann', { 1: H, 2: H, 3: H, 4: H }), // 2 correct
      entry(2, 'Bob', { 1: A, 2: A, 3: A, 4: A }), // 0; best case (A, A): Bob 2, Ann 2 => level, tiebreaker open => alive
      entry(3, 'Cy', { 1: A, 2: A, 3: H, 4: H }), // 0; best case (H, H): Cy 2, but Ann gains both too => 4 => out
    ];
    expect(eliminatedEntryIds(live, es)).toEqual([3]);
  });

  it('a rival who agrees on a pending game gains the same point', () => {
    const es = [
      entry(1, 'Ann', { 1: H, 2: H, 3: H, 4: A }), // 2
      entry(2, 'Bob', { 1: H, 2: A, 3: H, 4: H }), // 1; best case: Bob 3, Ann 3 => alive
    ];
    expect(eliminatedEntryIds(live, es)).toEqual([]);
  });

  it('level on correct: out only once the tiebreaker game is final and a rival guessed closer', () => {
    // Tiebreaker (game 4) final at 41 total; game 3 still pending.
    const g = [fin(1, THU, 20, 10), fin(2, SUN, 24, 17), game(3, SUN), fin(4, MON, 21, 20)];
    const es = [
      entry(1, 'Ann', { 1: H, 2: H, 3: H, 4: H }, 41), // 3 correct, diff 0
      entry(2, 'Bob', { 1: H, 2: H, 3: A, 4: A }, 50), // 2 correct; best case 3 = Ann's 3, diff 9 > 0 => out
      entry(3, 'Cy', { 1: H, 2: H, 3: A, 4: A }, 41), // 2; best case 3, same diff 0 => co-winner possible
    ];
    expect(eliminatedEntryIds(g, es)).toEqual([2]);
    // Before the tiebreaker game is final the same picks keep Bob alive.
    expect(eliminatedEntryIds(live, es)).toEqual([]);
  });

  it('only paid entries count, both as candidates and as rivals', () => {
    const es = [
      entry(1, 'Ann', { 1: H, 2: H, 3: H, 4: H }, 40, false), // unpaid leader
      entry(2, 'Cy', { 1: A, 2: A, 3: H, 4: H }),
      entry(3, 'Di', { 1: A, 2: A, 3: H, 4: H }),
    ];
    expect(eliminatedEntryIds(live, es)).toEqual([]);
  });

  it('void games help nobody; postponed games are still pending', () => {
    const g = [fin(1, THU, 20, 10), game(2, SUN, { status: 'void' }), game(3, SUN, { status: 'postponed' })];
    const es = [entry(1, 'Ann', { 1: H, 2: H, 3: H }), entry(2, 'Bob', { 1: A, 2: H, 3: A })];
    // Bob: 0 correct, best case 1 (game 3) = Ann's 1 => alive.
    expect(eliminatedEntryIds(g, es)).toEqual([]);
    const g2 = [fin(1, THU, 20, 10), game(2, SUN, { status: 'void' }), fin(3, SUN, 20, 10), game(4, MON)];
    const es2 = [entry(1, 'Ann', { 1: H, 2: H, 3: H, 4: H }), entry(2, 'Bob', { 1: A, 2: A, 3: A, 4: A })];
    expect(eliminatedEntryIds(g2, es2)).toEqual([2]);
  });

  it('nobody is out once the week is final, with no pending games, or with fewer than two counted entries', () => {
    const done = [fin(1, THU, 20, 10), fin(2, MON, 20, 10)];
    const es = [entry(1, 'Ann', { 1: H, 2: H }), entry(2, 'Bob', { 1: A, 2: A })];
    expect(eliminatedEntryIds(done, es)).toEqual([]);
    expect(weekSummary(done, es).eliminated).toEqual([]);
    expect(eliminatedEntryIds(live, [entry(1, 'Ann', { 1: A, 2: A, 3: A, 4: A })])).toEqual([]);
  });

  it('weekSummary reports it while the week is live; each entry of one player stands alone', () => {
    const es = [
      entry(1, 'Ann (1)', { 1: H, 2: H, 3: H, 4: H }, 40, true, 11),
      entry(1, 'Ann (2)', { 1: A, 2: A, 3: H, 4: H }, 40, true, 12),
    ];
    expect(weekSummary(live, es).eliminated).toEqual([12]);
  });
});
