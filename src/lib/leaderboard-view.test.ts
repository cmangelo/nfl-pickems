import { describe, expect, it } from 'vitest';
import {
  formatUpdatedAgo,
  joinNames,
  playersLabel,
  tiebreakerDiffLabel,
  upsetHeadline,
  upsetRightText,
  upsetWrongText,
  winnerBanner,
} from './leaderboard-view';

const T = new Date('2026-10-09T20:00:00Z');
const ago = (min: number) => new Date(T.getTime() - min * 60_000);

describe('formatUpdatedAgo', () => {
  it('handles never, just now, minutes, hours, days', () => {
    expect(formatUpdatedAgo(null, T)).toBe('Not synced yet');
    expect(formatUpdatedAgo(ago(0), T)).toBe('Updated just now');
    expect(formatUpdatedAgo(new Date(T.getTime() + 5000), T)).toBe('Updated just now');
    expect(formatUpdatedAgo(ago(1), T)).toBe('Updated 1 min ago');
    expect(formatUpdatedAgo(ago(59), T)).toBe('Updated 59 min ago');
    expect(formatUpdatedAgo(ago(60), T)).toBe('Updated 1 hr ago');
    expect(formatUpdatedAgo(ago(23 * 60 + 59), T)).toBe('Updated 23 hr ago');
    expect(formatUpdatedAgo(ago(24 * 60), T)).toBe('Updated 1 day ago');
    expect(formatUpdatedAgo(ago(72 * 60), T)).toBe('Updated 3 days ago');
  });
});

describe('names and plurals', () => {
  it('joins names', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
  it('pluralizes players', () => {
    expect(playersLabel(1)).toBe('1 player');
    expect(playersLabel(8)).toBe('8 players');
  });
  it('formats the tiebreaker diff', () => {
    expect(tiebreakerDiffLabel(null)).toBe('');
    expect(tiebreakerDiffLabel(0)).toBe('(±0)');
    expect(tiebreakerDiffLabel(3)).toBe('(±3)');
  });
});

describe('upset phrasing', () => {
  it('headline picks the winner and its score first', () => {
    expect(upsetHeadline({ homeTeam: 'LV', awayTeam: 'CHI', homeScore: 20, awayScore: 24, winner: 'away' })).toBe('CHI over LV, 24–20');
    expect(upsetHeadline({ homeTeam: 'LV', awayTeam: 'CHI', homeScore: 27, awayScore: 17, winner: 'home' })).toBe('LV over CHI, 27–17');
    expect(upsetHeadline({ homeTeam: 'LV', awayTeam: 'CHI', homeScore: 20, awayScore: 20, winner: 'tie' })).toBeNull();
  });
  it('wrong / right texts never use "of N"', () => {
    expect(upsetWrongText({ wrongCount: 8 })).toBe('8 players got it wrong');
    expect(upsetWrongText({ wrongCount: 1 })).toBe('1 player got it wrong');
    expect(upsetRightText({ correctCount: 1, correctNames: ['Sarah'] })).toBe('Only 1 player picked it (Sarah)');
    expect(upsetRightText({ correctCount: 2, correctNames: ['Al', 'Bo'] })).toBe('Only 2 players picked it (Al and Bo)');
    expect(upsetRightText({ correctCount: 0, correctNames: [] })).toBe('Nobody picked it');
    expect(upsetRightText({ correctCount: 5, correctNames: null })).toBeNull();
  });
});

describe('winnerBanner', () => {
  it('null without winners', () => expect(winnerBanner(5, [], 14)).toBeNull());
  it('single winner', () =>
    expect(winnerBanner(5, [{ name: 'Sarah', correct: 12 }], 14)).toEqual({
      title: 'Week 5 winner',
      names: 'Sarah',
      detail: '12 of 14 correct · outright win',
    }));
  it('co-winners', () =>
    expect(winnerBanner(5, [{ name: 'Al', correct: 3 }, { name: 'Bo', correct: 3 }], 4)).toEqual({
      title: 'Week 5 co-winners',
      names: 'Al and Bo',
      detail: '3 of 4 correct · tied, co-winners',
    }));
});
