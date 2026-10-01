import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { weeks } from '@/db/schema';
import { freshDb, makeWeek } from './testing/helpers';
import { defaultLockAt, effectiveLock, getCurrentWeek, getVisibleWeeks, isThanksgivingWeek, setWeekLockOverride, weekState } from './weeks';
import { weekTuesday } from './time';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);
// Week of Oct 6 2026: unlock Tue 00:00 PDT, lock Thu 12:00 PDT
const base = { unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') };
const sched = [{ status: 'scheduled' as const }, { status: 'final' as const }];
const allFinal = [{ status: 'final' as const }, { status: 'final' as const }];

describe('weekState', () => {
  it('hidden before unlock', () => {
    expect(weekState(base, sched, d('2026-10-06T06:59:59Z'))).toBe('hidden');
  });
  it('open from unlock until lock', () => {
    expect(weekState(base, sched, d('2026-10-06T07:00:00Z'))).toBe('open');
    expect(weekState(base, allFinal, d('2026-10-08T18:59:59Z'))).toBe('open');
  });
  it('locked at lock while games remain', () => {
    expect(weekState(base, sched, d('2026-10-08T19:00:00Z'))).toBe('locked');
  });
  it('final when all games final and past lock', () => {
    expect(weekState(base, allFinal, d('2026-10-13T20:00:00Z'))).toBe('final');
  });
  it('a week with no games is never final', () => {
    expect(weekState(base, [], d('2026-10-20T00:00:00Z'))).toBe('locked');
  });
  it('uses the lock override when set', () => {
    const w = { ...base, lockOverrideAt: d('2026-10-09T19:00:00Z') };
    expect(effectiveLock(w)).toEqual(d('2026-10-09T19:00:00Z'));
    expect(weekState(w, sched, d('2026-10-08T20:00:00Z'))).toBe('open');
    expect(weekState(w, sched, d('2026-10-09T19:00:00Z'))).toBe('locked');
    // override earlier than default
    const early = { ...base, lockOverrideAt: d('2026-10-07T19:00:00Z') };
    expect(weekState(early, sched, d('2026-10-08T00:00:00Z'))).toBe('locked');
  });
});

describe('default lock', () => {
  it('Thu 12:00 PT normally (PDT)', () => {
    expect(defaultLockAt(weekTuesday(d('2026-10-07T20:00:00Z')))).toEqual(d('2026-10-08T19:00:00Z'));
  });
  it('Thu 12:00 PT in PST (DST-correct)', () => {
    expect(defaultLockAt(weekTuesday(d('2026-12-02T20:00:00Z')))).toEqual(d('2026-12-03T20:00:00Z'));
  });
  it('Thanksgiving week locks Thu 09:00 PT', () => {
    const tue = weekTuesday(d('2026-11-25T20:00:00Z')); // Nov 24; Thanksgiving Nov 26 2026
    expect(isThanksgivingWeek(tue)).toBe(true);
    expect(defaultLockAt(tue)).toEqual(d('2026-11-26T17:00:00Z'));
  });
  it('detects only the 4th-Thursday week', () => {
    expect(isThanksgivingWeek({ year: 2026, month: 11, day: 17 })).toBe(false); // Thu Nov 19 (3rd)
    expect(isThanksgivingWeek({ year: 2026, month: 12, day: 1 })).toBe(false);
    expect(isThanksgivingWeek({ year: 2027, month: 11, day: 23 })).toBe(true); // Thu Nov 25 2027
    expect(isThanksgivingWeek({ year: 2025, month: 11, day: 25 })).toBe(true); // Thu Nov 27 2025
    expect(isThanksgivingWeek({ year: 2028, month: 11, day: 21 })).toBe(true); // Thu Nov 23 2028
  });
});

describe('week queries', () => {
  beforeEach(async () => {
    await freshDb();
  });

  it('current = latest unlocked; visible = current and past, newest first', async () => {
    const w4 = await makeWeek({ weekNumber: 4, unlockAt: d('2026-09-29T07:00:00Z'), lockAt: d('2026-10-01T19:00:00Z') });
    const w5 = await makeWeek({ weekNumber: 5, ...base });
    await makeWeek({ weekNumber: 6, unlockAt: d('2026-10-13T07:00:00Z'), lockAt: d('2026-10-15T19:00:00Z') });
    expect(await getCurrentWeek(d('2026-09-28T00:00:00Z'))).toBeNull();
    expect((await getCurrentWeek(d('2026-10-07T00:00:00Z')))?.id).toBe(w5.week.id);
    expect((await getCurrentWeek(d('2026-10-06T07:00:00Z')))?.id).toBe(w5.week.id);
    expect((await getVisibleWeeks(d('2026-10-07T00:00:00Z'))).map((w) => w.weekNumber)).toEqual([5, 4]);
    expect((await getVisibleWeeks(d('2026-10-14T00:00:00Z'))).map((w) => w.weekNumber)).toEqual([6, 5, 4]);
    expect((await getVisibleWeeks(d('2026-09-28T00:00:00Z')))).toEqual([]);
    expect(w4.week.id).toBeLessThan(w5.week.id);
  });

  it('setWeekLockOverride sets and clears', async () => {
    const { week } = await makeWeek({ weekNumber: 5, ...base });
    const db = await getDb();
    await setWeekLockOverride(week.id, d('2026-10-09T01:00:00Z'));
    expect((await db.select().from(weeks).where(eq(weeks.id, week.id)))[0].lockOverrideAt).toEqual(d('2026-10-09T01:00:00Z'));
    await setWeekLockOverride(week.id, null);
    expect((await db.select().from(weeks).where(eq(weeks.id, week.id)))[0].lockOverrideAt).toBeNull();
  });
});
