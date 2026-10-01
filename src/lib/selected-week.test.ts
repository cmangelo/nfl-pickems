import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, makeWeek } from './testing/helpers';
import { getSelectedWeek } from './selected-week';

process.env.DB_DRIVER = 'memory';

const d = (s: string) => new Date(s);
const w4 = { weekNumber: 4, unlockAt: d('2026-09-29T07:00:00Z'), lockAt: d('2026-10-01T19:00:00Z') };
const w5 = { weekNumber: 5, unlockAt: d('2026-10-06T07:00:00Z'), lockAt: d('2026-10-08T19:00:00Z') };
const w6 = { weekNumber: 6, unlockAt: d('2026-10-13T07:00:00Z'), lockAt: d('2026-10-15T19:00:00Z') };

describe('getSelectedWeek', () => {
  let ids: { w4: number; w5: number; w6: number };
  beforeEach(async () => {
    await freshDb();
    const a = await makeWeek(w4, [{ status: 'final', winner: 'home' }]);
    const b = await makeWeek(w5, [{}, {}]);
    const c = await makeWeek(w6, [{}]);
    ids = { w4: a.week.id, w5: b.week.id, w6: c.week.id };
  });
  const at = d('2026-10-07T20:00:00Z'); // Wed of week 5

  it('defaults to the current week', async () => {
    const s = await getSelectedWeek(undefined, at);
    expect(s.week?.id).toBe(ids.w5);
    expect(s.state).toBe('open');
    expect(s.games).toHaveLength(2);
    expect(s.visibleWeeks.map((v) => v.week.id)).toEqual([ids.w5, ids.w4]);
  });
  it('selects a past visible week', async () => {
    const s = await getSelectedWeek(String(ids.w4), at);
    expect(s.week?.id).toBe(ids.w4);
    expect(s.state).toBe('final');
  });
  it('falls back to current for a future (hidden) or unknown week', async () => {
    expect((await getSelectedWeek(String(ids.w6), at)).week?.id).toBe(ids.w5);
    expect((await getSelectedWeek('99999', at)).week?.id).toBe(ids.w5);
    expect((await getSelectedWeek('junk', at)).week?.id).toBe(ids.w5);
  });
  it('is null when no week has unlocked', async () => {
    const s = await getSelectedWeek(String(ids.w5), d('2026-01-01T00:00:00Z'));
    expect(s.week).toBeNull();
    expect(s.state).toBeNull();
    expect(s.visibleWeeks).toEqual([]);
  });
});
