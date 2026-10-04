import { describe, expect, it } from 'vitest';
import { percent, podium, weekReport } from './report';
import { rankEntries, weekSummary, type ScoringEntry, type ScoringGame } from './scoring';

const T = (iso: string) => new Date(iso);
function game(id: number, kickoff: string, over: Partial<ScoringGame> = {}): ScoringGame {
  return { id, kickoffAt: T(kickoff), homeTeam: `H${id}`, awayTeam: `A${id}`, homeScore: null, awayScore: null, status: 'scheduled', winner: null, ...over };
}
const fin = (id: number, kickoff: string, h: number, a: number) =>
  game(id, kickoff, { homeScore: h, awayScore: a, status: 'final', winner: h === a ? 'tie' : h > a ? 'home' : 'away' });
const entry = (userId: number, name: string, picks: Record<number, 'home' | 'away'>, tiebreaker = 40, paid = true): ScoringEntry => ({
  entryId: userId,
  userId,
  name,
  paid,
  tiebreaker,
  picks,
});

const H = 'home' as const;
const A = 'away' as const;
const SUN = '2026-10-11T17:00:00Z';
const SUN2 = '2026-10-11T20:00:00Z';
const SUN3 = '2026-10-12T00:20:00Z';
const MON = '2026-10-13T00:20:00Z';

// g1 home 30-10 (margin 20), g2 away 17-21, g3 home 24-23, g4 (Monday tiebreaker) home 27-17 => total 44.
const games = [fin(1, SUN, 30, 10), fin(2, SUN2, 17, 21), fin(3, SUN3, 24, 23), fin(4, MON, 27, 17)];
const entries = [
  entry(1, 'Ann', { 1: H, 2: A, 3: H, 4: A }, 40), // 3 correct, diff 4
  entry(2, 'Bob', { 1: H, 2: A, 3: A, 4: H }, 47), // 3 correct, diff 3 => winner
  entry(3, 'Cy', { 1: H, 2: H, 3: H, 4: A }, 44), // 2 correct, diff 0
  entry(4, 'Di', { 1: A, 2: H, 3: A, 4: H }, 50), // 1 correct
  entry(5, 'Ed', { 1: A, 2: A, 3: A, 4: A }, 30, false), // unpaid: never counted
];
const summary = weekSummary(games, entries);
const report = weekReport(games, entries, summary);

describe('podium', () => {
  it('groups by distinct rank, ranks 1..3 only', () => {
    expect(report.podium.map((s) => [s.rank, s.entries.map((e) => e.name), s.correct])).toEqual([
      [1, ['Bob'], 3],
      [2, ['Ann'], 3],
      [3, ['Cy'], 2],
    ]);
  });
  it('a shared 1st takes two names and the next step is 3rd', () => {
    const g = [fin(1, SUN, 20, 10)];
    const es = [entry(1, 'Ann', { 1: H }), entry(2, 'Bob', { 1: H }), entry(3, 'Cy', { 1: A }), entry(4, 'Di', { 1: A })];
    const steps = podium(rankEntries(g, es));
    expect(steps.map((s) => [s.rank, s.tied, s.entries.map((e) => e.name)])).toEqual([
      [1, true, ['Ann', 'Bob']],
      [3, true, ['Cy', 'Di']],
    ]);
  });
  it('empty with nobody counted', () => {
    expect(podium([])).toEqual([]);
  });
});

describe('weekReport', () => {
  it('upset is the game most counted entries missed; the lock is never the upset game', () => {
    // g2, g3 and g4 each have 2 wrong at 50%: the latest kickoff (g4) is the upset. g1: 3 right (75%) => lock.
    expect(summary.upset?.gameId).toBe(4);
    expect(report.lock).toEqual({ gameId: 1, pickers: 4, right: 3 });
  });

  it('coin flip is the most even split, excluding the upset and the lock', () => {
    // g2 and g3 are both 2 / 2: the later kickoff (g3, home won) wins.
    expect(report.coinFlip).toEqual({ gameId: 3, pickers: 4, right: 2, home: 2, away: 2 });
  });

  it('blowout is the biggest final margin', () => {
    expect(report.blowout).toEqual({ gameId: 1, margin: 20 });
  });

  it('closest tiebreaker guess among counted entries (unpaid Ed is ignored)', () => {
    expect(report.closestTiebreaker).toEqual({ diff: 0, names: ['Cy'] });
  });

  it('bad beat: level with the winner on correct picks, lost on the tiebreaker', () => {
    expect(report.badBeat).toEqual({ names: ['Ann'], correct: 3, behindBy: 1 });
  });

  it('contrarian: most picks on the minority side, ties broken by hits', () => {
    // Splits (paid): g1 3H/1A, g2-g4 even (no minority). Di alone took the minority on g1 (away, lost).
    expect(report.contrarian).toEqual({ names: ['Di'], against: 1, hits: 0 });
    // Two entries level on "against": more hits wins.
    const g = [fin(1, SUN, 20, 10), fin(2, SUN2, 10, 20)];
    const es = [
      entry(1, 'Ann', { 1: A, 2: H }), // g1: away is the minority (lost)
      entry(2, 'Bob', { 1: H, 2: A }), // g2: A minority (won)
      entry(3, 'Cy', { 1: H, 2: H }),
      entry(4, 'Di', { 1: H, 2: H }),
    ];
    expect(weekReport(g, es, weekSummary(g, es)).contrarian).toEqual({ names: ['Bob'], against: 1, hits: 1 });
  });

  it('no bad beat with an outright win on correct picks; no awards without data', () => {
    const g = [fin(1, SUN, 20, 10), fin(2, MON, 21, 20)];
    const es = [entry(1, 'Ann', { 1: H, 2: H }, 41), entry(2, 'Bob', { 1: A, 2: H }, 41)];
    const r = weekReport(g, es, weekSummary(g, es));
    expect(r.badBeat).toBeNull();
    expect(r.contrarian).toBeNull(); // needs 3+ counted entries to mean anything
    const empty = weekReport(g, [], weekSummary(g, []));
    expect(empty).toMatchObject({ podium: [], lock: null, coinFlip: null, closestTiebreaker: null, badBeat: null, contrarian: null });
    expect(empty.blowout).toEqual({ gameId: 1, margin: 10 });
  });

  it('tie and void games are never a game award', () => {
    const g = [fin(1, SUN, 20, 20), game(2, SUN2, { status: 'void', homeScore: 50, awayScore: 0, winner: 'home' })];
    const es = [entry(1, 'Ann', { 1: H, 2: H }), entry(2, 'Bob', { 1: A, 2: A })];
    const r = weekReport(g, es, weekSummary(g, es));
    expect(r).toMatchObject({ lock: null, coinFlip: null, blowout: null });
  });
});

describe('percent', () => {
  it('rounds and handles zero', () => {
    expect(percent(3, 4)).toBe('75%');
    expect(percent(2, 3)).toBe('67%');
    expect(percent(0, 0)).toBe('0%');
  });
});
