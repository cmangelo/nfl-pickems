import { describe, expect, it } from 'vitest';
import { formatPT, ptDayOfWeek, weekLockAt, weekTuesday, weekUnlockAt } from './time';

describe('PT week helpers', () => {
  it('finds the Tuesday of the week from any day', () => {
    // Wed Oct 7 2026 20:00 UTC; Tuesday is Oct 6
    expect(weekTuesday(new Date('2026-10-07T20:00:00Z'))).toEqual({ year: 2026, month: 10, day: 6 });
    // Mon Oct 12 2026 23:30 PT == Tue 06:30Z; still Monday in PT -> Tuesday Oct 6
    expect(weekTuesday(new Date('2026-10-13T06:30:00Z'))).toEqual({ year: 2026, month: 10, day: 6 });
    // Tue Oct 13 00:00 PT = 07:00Z -> new week
    expect(weekTuesday(new Date('2026-10-13T07:00:00Z'))).toEqual({ year: 2026, month: 10, day: 13 });
  });

  it('day of week uses PT, not UTC', () => {
    expect(ptDayOfWeek(new Date('2026-10-13T06:59:00Z'))).toBe(1); // Monday 11:59 PM PT
    expect(ptDayOfWeek(new Date('2026-10-13T07:00:00Z'))).toBe(2); // Tuesday midnight PT
  });

  it('unlock is Tuesday 00:00 PT and lock is Thursday 12:00 PT (PDT)', () => {
    const tue = { year: 2026, month: 10, day: 6 };
    expect(weekUnlockAt(tue).toISOString()).toBe('2026-10-06T07:00:00.000Z');
    expect(weekLockAt(tue).toISOString()).toBe('2026-10-08T19:00:00.000Z');
  });

  it('Thanksgiving lock is 9 AM PT', () => {
    const tue = { year: 2026, month: 11, day: 24 };
    expect(weekLockAt(tue, 9).toISOString()).toBe('2026-11-26T17:00:00.000Z'); // PST: UTC-8
  });

  it('is DST-correct across the fall-back boundary (Sun Nov 1 2026)', () => {
    // Tuesday Oct 27 is PDT (UTC-7); Thursday Oct 29 is PDT too.
    expect(weekLockAt({ year: 2026, month: 10, day: 27 }).toISOString()).toBe('2026-10-29T19:00:00.000Z');
    // Tuesday Nov 3 is PST (UTC-8).
    expect(weekUnlockAt({ year: 2026, month: 11, day: 3 }).toISOString()).toBe('2026-11-03T08:00:00.000Z');
    expect(weekLockAt({ year: 2026, month: 11, day: 3 }).toISOString()).toBe('2026-11-05T20:00:00.000Z');
  });

  it('is DST-correct when the week straddles spring-forward (Sun Mar 8 2026)', () => {
    // Week starting Tue Mar 3 is PST; Thursday Mar 5 12:00 PST = 20:00Z
    expect(weekLockAt({ year: 2026, month: 3, day: 3 }).toISOString()).toBe('2026-03-05T20:00:00.000Z');
    // Tue Mar 10 is PDT
    expect(weekUnlockAt({ year: 2026, month: 3, day: 10 }).toISOString()).toBe('2026-03-10T07:00:00.000Z');
  });

  it('formats in PT', () => {
    expect(formatPT(new Date('2026-10-08T19:00:00Z'))).toBe('Thu Oct 8, 12:00 PM PT');
  });
});
