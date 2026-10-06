import { describe, expect, it } from 'vitest';
import type { ScoringEntry, ScoringGame } from './scoring';
import {
  compareRows,
  netLabel,
  playerWeeks,
  pct0,
  pct1,
  seasonStats,
  tbAvgLabel,
  type SeasonRow,
  type SeasonWeekInput,
} from './season';

const H = 'home' as const;
const A = 'away' as const;
const SUN = '2026-10-11T17:00:00Z';
const MON = '2026-10-13T00:20:00Z';

const fin = (id: number, kickoff: string, h: number, a: number): ScoringGame => ({
  id,
  kickoffAt: new Date(kickoff),
  homeTeam: `H${id}`,
  awayTeam: `A${id}`,
  homeScore: h,
  awayScore: a,
  status: 'final',
  winner: h === a ? 'tie' : h > a ? 'home' : 'away',
});
const sched = (id: number, kickoff: string): ScoringGame => ({ ...fin(id, kickoff, 0, 0), homeScore: null, awayScore: null, status: 'scheduled', winner: null });

let nextEntry = 1;
const entry = (userId: number, picks: Record<number, 'home' | 'away'>, tiebreaker = 40, paid = true): ScoringEntry => ({
  entryId: nextEntry++,
  userId,
  name: `u${userId}`,
  paid,
  tiebreaker,
  picks,
});

const names = new Map([
  [1, 'ann'],
  [2, 'bob'],
  [3, 'cy'],
  [4, 'di'],
]);

// Week 1: g1 home, g2 (Monday tiebreaker) away 17-21 => total 38.
//   ann 2/2 (tb 40, diff 2), bob 1/2 (tb 38, diff 0), cy 0/2 (diff 12), di unpaid 2/2.
const week1: SeasonWeekInput = {
  weekId: 11,
  weekNumber: 1,
  games: [fin(1, SUN, 24, 10), fin(2, MON, 17, 21)],
  entries: [entry(1, { 1: H, 2: A }, 40), entry(2, { 1: H, 2: H }, 38), entry(3, { 1: A, 2: H }, 50), entry(4, { 1: H, 2: A }, 38, false)],
  tiebreakerGameId: 2,
  feeCents: 1000,
};
// Week 2: g3 tie (a miss for everyone), g4 home, g5 void, g6 (Monday tiebreaker) home 30-20 => total 50.
//   bob has two entries: (1) 1/2 tb 50 diff 0, (2) 1/2 tb 50 diff 0 => shared 1st with ann (1/2, tb 50).
//   cy 0/2 (tb 44, diff 6).
const week2: SeasonWeekInput = {
  weekId: 12,
  weekNumber: 2,
  games: [fin(3, SUN, 20, 20), fin(4, SUN, 27, 3), { ...fin(5, SUN, 0, 0), status: 'void', winner: null }, fin(6, MON, 30, 20)],
  entries: [
    entry(1, { 3: H, 4: A, 5: H, 6: H }, 50),
    entry(2, { 3: H, 4: H, 5: H, 6: A }, 50),
    entry(2, { 3: A, 4: A, 5: A, 6: H }, 50),
    entry(3, { 3: H, 4: A, 5: H, 6: A }, 44),
  ],
  tiebreakerGameId: 6,
  feeCents: 1000,
};
// Week 3: still in progress => skipped entirely.
const week3: SeasonWeekInput = {
  weekId: 13,
  weekNumber: 3,
  games: [fin(7, SUN, 10, 3), sched(8, MON)],
  entries: [entry(3, { 7: H, 8: H }, 40), entry(4, { 7: H, 8: H }, 40)],
  tiebreakerGameId: 8,
  feeCents: 1000,
};

const stats = seasonStats([week3, week2, week1], names);
const byName = (n: string) => stats.rows.find((r) => r.name === n)!;

describe('seasonStats', () => {
  it('counts final weeks only, in order, and only players with a paid entry', () => {
    expect(stats.weekNumbers).toEqual([1, 2]);
    expect(stats.rows.map((r) => r.name).sort()).toEqual(['ann', 'bob', 'cy']); // di only ever unpaid / in an unfinished week
    expect(stats.hasMoney).toBe(true);
  });

  it('totals correct over graded picks; a tie is a miss and a void game is not graded', () => {
    expect([byName('ann').correct, byName('ann').graded]).toEqual([3, 5]);
    expect(byName('ann').pct).toBeCloseTo(0.6);
    // bob: week 1 1/2, week 2 two entries 1/3 each.
    expect([byName('bob').correct, byName('bob').graded, byName('bob').entries, byName('bob').weeks]).toEqual([3, 8, 3, 2]);
    expect([byName('cy').correct, byName('cy').graded]).toEqual([0, 5]);
    expect(byName('cy').pct).toBe(0);
  });

  it('best week: highest percent, then more correct, then the earlier week', () => {
    expect(byName('ann').best).toMatchObject({ weekNumber: 1, correct: 2, total: 2, pct: 1 });
    expect(byName('bob').best).toMatchObject({ weekNumber: 1, correct: 1, total: 2 });
    expect(byName('cy').best).toMatchObject({ weekNumber: 1, correct: 0 });
  });

  it('wins count weeks (a shared 1st is a win, two winning entries still one), top 3 likewise', () => {
    expect(byName('ann').wins).toBe(2); // week 1 alone, week 2 shared
    expect(byName('bob').wins).toBe(1);
    expect(byName('cy').wins).toBe(0);
    expect(byName('bob').top3).toBe(2);
  });

  it('average tiebreaker distance over counted entries', () => {
    expect(byName('ann').avgTbDiff).toBe(1); // 2, 0
    expect(byName('bob').avgTbDiff).toBe(0); // 0, 0, 0
    expect(byName('cy').avgTbDiff).toBe(9); // 12, 6
  });

  it('money: fee per counted entry, pot shares split between winning entries (rounded down)', () => {
    // Week 1 pot $30 to ann. Week 2 pot $40 over 3 winning entries: $13.33 each.
    expect(byName('ann')).toMatchObject({ winningsCents: 3000 + 1333, feesCents: 2000, netCents: 2333 });
    expect(byName('bob')).toMatchObject({ winningsCents: 2666, feesCents: 3000, netCents: -334 });
    expect(byName('cy')).toMatchObject({ winningsCents: 0, feesCents: 2000, netCents: -2000 });
  });

  it('no fee => no money, but stats still count', () => {
    const free = seasonStats([{ ...week1, feeCents: null }, { ...week2, feeCents: 0 }], names);
    expect(free.hasMoney).toBe(false);
    expect(free.rows.every((r) => r.netCents === 0 && r.feesCents === 0)).toBe(true);
    expect(free.weekNumbers).toEqual([1, 2]);
  });

  it('empty with no final week', () => {
    expect(seasonStats([week3], names)).toEqual({ rows: [], weekNumbers: [], hasMoney: false });
    expect(seasonStats([], names).rows).toEqual([]);
  });

  it('a final week with nobody paid is not counted', () => {
    const unpaid = { ...week1, entries: week1.entries.map((e) => ({ ...e, paid: false })) };
    expect(seasonStats([unpaid], names).weekNumbers).toEqual([]);
  });

  it('default order: percent desc', () => {
    expect(stats.rows.map((r) => r.name)).toEqual(['ann', 'bob', 'cy']);
  });
});

describe('streak', () => {
  it('first counted entry each week, kickoff order: a tie or miss ends it', () => {
    // ann: week 1 right, right (2); week 2 opens with a tie. bob (first entry): 1, then 1 again in week 2. cy never.
    expect([byName('ann').streak, byName('bob').streak, byName('cy').streak]).toEqual([2, 1, 0]);
  });
  it('carries across weeks, skips void games and survives a week sat out', () => {
    const wA: SeasonWeekInput = { weekId: 21, weekNumber: 1, games: [fin(10, SUN, 20, 10), fin(11, MON, 21, 3)], entries: [entry(1, { 10: H, 11: H })], tiebreakerGameId: 11, feeCents: null };
    const wB: SeasonWeekInput = { weekId: 22, weekNumber: 2, games: [fin(15, SUN, 20, 10)], entries: [entry(2, { 15: H })], tiebreakerGameId: 15, feeCents: null };
    const wC: SeasonWeekInput = {
      weekId: 23,
      weekNumber: 3,
      games: [fin(12, SUN, 20, 10), { ...fin(13, SUN, 0, 0), status: 'void', winner: null }, fin(14, MON, 30, 3), fin(16, MON, 3, 30)],
      entries: [entry(1, { 12: H, 13: A, 14: H, 16: H })],
      tiebreakerGameId: 16,
      feeCents: null,
    };
    const s = seasonStats([wC, wA, wB], names);
    expect(s.rows.find((r) => r.name === 'ann')!.streak).toBe(4); // 10, 11, (week 2 sat out), 12, (13 void), 14; then 16 missed
  });
});

describe('playerWeeks', () => {
  it('newest first, final weeks with a counted entry, finish, score, tiebreaker and payout per entry', () => {
    expect(playerWeeks([week3, week2, week1], 2)).toEqual([
      {
        weekId: 12,
        weekNumber: 2,
        entries: [
          { entryId: week2.entries[1].entryId, label: 'Entry 1', rank: 1, tied: true, correct: 1, total: 3, tbDiff: 0, payoutCents: 1333 },
          { entryId: week2.entries[2].entryId, label: 'Entry 2', rank: 1, tied: true, correct: 1, total: 3, tbDiff: 0, payoutCents: 1333 },
        ],
      },
      { weekId: 11, weekNumber: 1, entries: [{ entryId: week1.entries[1].entryId, label: null, rank: 2, tied: false, correct: 1, total: 2, tbDiff: 0, payoutCents: 0 }] },
    ]);
  });
  it('skips weeks in progress and unpaid-only weeks', () => {
    expect(playerWeeks([week3, week2, week1], 3).map((w) => w.weekNumber)).toEqual([2, 1]);
    expect(playerWeeks([week3, week2, week1], 4)).toEqual([]);
  });
});

describe('top 3 detail', () => {
  it('cy is 3rd in week 1 and 4th in week 2', () => {
    // Week 2 ranks: ann, bob(1), bob(2) all 1/3 with diff 0 => T-1st; cy 0/3 => 4th.
    expect(byName('cy').top3).toBe(1);
  });
});

describe('compareRows', () => {
  const row = (name: string, over: Partial<SeasonRow>): SeasonRow => ({
    userId: name.charCodeAt(0),
    name,
    weeks: 1,
    entries: 1,
    correct: 5,
    graded: 10,
    pct: 0.5,
    best: null,
    wins: 0,
    top3: 0,
    avgTbDiff: null,
    winningsCents: 0,
    feesCents: 0,
    netCents: 0,
    streak: 0,
    ...over,
  });
  const a = row('a', { wins: 2, avgTbDiff: 5 });
  const b = row('b', { wins: 1, avgTbDiff: 2, pct: 0.6 });
  const c = row('c', { wins: 3, avgTbDiff: null, pct: null });
  const sorted = (key: Parameters<typeof compareRows>[2], reverse = false) =>
    [a, b, c].sort((x, y) => compareRows(x, y, key, reverse)).map((r) => r.name);

  it('higher is better except the tiebreaker distance', () => {
    expect(sorted('wins')).toEqual(['c', 'a', 'b']);
    expect(sorted('tb')).toEqual(['b', 'a', 'c']);
  });
  it('reverse flips the direction but missing values stay last', () => {
    expect(sorted('tb', true)).toEqual(['a', 'b', 'c']);
    expect(sorted('pct', true)).toEqual(['a', 'b', 'c']);
    expect(sorted('pct')).toEqual(['b', 'a', 'c']);
  });
  it('entries: more first', () => {
    const many = { ...a, entries: 3 };
    expect([b, many, c].sort((x, y) => compareRows(x, y, 'entries')).map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });
  it('ties fall back to percent, then wins, then name', () => {
    expect(sorted('weeks')).toEqual(['b', 'a', 'c']);
  });
});

describe('labels', () => {
  it('percent, tiebreaker, net money', () => {
    expect(pct1(0.6842)).toBe('68.4%');
    expect(pct1(1)).toBe('100.0%');
    expect(pct0(0.9375)).toBe('94%');
    expect(tbAvgLabel(3.25)).toBe('±3.3');
    expect(netLabel(3000)).toBe('+$30');
    expect(netLabel(-334)).toBe('−$3.34');
    expect(netLabel(0)).toBe('$0');
  });
});
