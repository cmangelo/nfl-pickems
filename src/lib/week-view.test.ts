import { describe, expect, it } from 'vitest';
import { formatCountdown, groupGamesByPtDay, ordinal, rankLabel, resolveWeekId, safeFrom } from './week-view';

describe('resolveWeekId', () => {
  it('uses a visible id', () => expect(resolveWeekId('3', [5, 3, 2], 5)).toBe(3));
  it('falls back for unknown / hidden ids', () => {
    expect(resolveWeekId('99', [5, 3, 2], 5)).toBe(5);
    expect(resolveWeekId('abc', [5, 3, 2], 5)).toBe(5);
    expect(resolveWeekId('3x', [5, 3, 2], 5)).toBe(5);
  });
  it('falls back when missing; null with no weeks', () => {
    expect(resolveWeekId(undefined, [5], 5)).toBe(5);
    expect(resolveWeekId(['2', '3'], [5, 2], 5)).toBe(2);
    expect(resolveWeekId('1', [], null)).toBeNull();
  });
});

describe('formatCountdown', () => {
  const H = 3600_000;
  it('formats days and hours', () => expect(formatCountdown(38 * H + 5 * 60_000)).toBe('1 day 14 hrs left'));
  it('singular units', () => expect(formatCountdown(25 * H)).toBe('1 day 1 hr left'));
  it('hours and minutes', () => expect(formatCountdown(5 * H + 10 * 60_000)).toBe('5 hrs 10 mins left'));
  it('exactly one hour is hours and minutes', () => expect(formatCountdown(H)).toBe('1 hr 0 mins left'));
  it('under an hour is mm:ss', () => {
    expect(formatCountdown(42 * 60_000 + 7_000)).toBe('42:07 left');
    expect(formatCountdown(H - 1)).toBe('59:59 left');
  });
  it('under a minute', () => {
    expect(formatCountdown(10_000)).toBe('00:10 left');
    expect(formatCountdown(500)).toBe('00:00 left');
  });
  it('locked at or past zero', () => {
    expect(formatCountdown(0)).toBe('Locked');
    expect(formatCountdown(-5)).toBe('Locked');
  });
});

describe('groupGamesByPtDay', () => {
  it('groups by PT day, not UTC day', () => {
    const g = (id: number, iso: string) => ({ id, kickoffAt: new Date(iso) });
    const groups = groupGamesByPtDay([
      g(3, '2026-10-12T00:20:00Z'), // Sunday 5:20 PM PT
      g(1, '2026-10-09T00:15:00Z'), // Thursday 5:15 PM PT
      g(2, '2026-10-11T17:00:00Z'), // Sunday 10 AM PT
      g(4, '2026-10-12T01:15:00Z'), // Monday in UTC but Sunday 6:15 PM PT
    ]);
    expect(groups.map((x) => x.label)).toEqual(['Thursday', 'Sunday']);
    expect(groups[1].games.map((x) => x.id)).toEqual([2, 3, 4]);
  });
  it('keeps Monday-night games together on Monday PT', () => {
    const groups = groupGamesByPtDay([
      { id: 1, kickoffAt: new Date('2026-10-12T17:00:00Z') },
      { id: 2, kickoffAt: new Date('2026-10-13T02:15:00Z') },
    ]);
    expect(groups.map((x) => x.label)).toEqual(['Monday']);
  });
});

describe('rank labels', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th'],
    );
  });
  it('tied has T- prefix and never "of N"', () => {
    expect(rankLabel(3, true)).toBe('T-3rd');
    expect(rankLabel(4, false)).toBe('4th');
  });
});

describe('safeFrom', () => {
  it('accepts app paths only', () => {
    expect(safeFrom('/leaderboard')).toBe('/leaderboard');
    expect(safeFrom('/admin/pay')).toBe('/admin/pay');
    expect(safeFrom('//evil.com')).toBe('/picks');
    expect(safeFrom('https://evil.com')).toBe('/picks');
    expect(safeFrom(undefined)).toBe('/picks');
  });
  it('accepts deeper app paths', () => {
    expect(safeFrom('/admin/picks/12')).toBe('/admin/picks/12');
    expect(safeFrom('/leaderboard/player/12')).toBe('/leaderboard/player/12');
  });
  it('rejects off-site, malformed and unknown paths', () => {
    for (const bad of [
      '//evil.com', '/\\evil.com', '\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/weeks', '/login',
      '/admin/picks/', '/admin/picks/abc', '/admin/picks/12/x', '/admin/picks/12?x=1', '/leaderboard/player/', '/leaderboard/player/1a',
      '/picks/12', '/admin/picks/12//evil.com', '/leaderboard/player/12/', '',
    ])
      expect(safeFrom(bad), bad).toBe('/picks');
  });
});
