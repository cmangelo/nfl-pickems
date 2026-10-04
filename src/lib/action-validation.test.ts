import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DB_DRIVER = 'memory';

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ id: 1, isAdmin: true }),
  requireUser: async () => ({ id: 1, isAdmin: true, firstName: 'A' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { isId } from './validate';

const BAD: unknown[] = [0, -1, 1.5, NaN, Infinity, 2 ** 40, '2', null, undefined, {}, [1]];
const INVALID = { ok: false, error: 'Invalid request.' };

describe('isId', () => {
  it('accepts positive int4 integers only', () => {
    for (const n of [1, 2, 99999, 2147483647]) expect(isId(n), String(n)).toBe(true);
    for (const n of BAD) expect(isId(n), String(n)).toBe(false);
  });
});

describe('admin actions reject malformed ids with a validation error (no DB error thrown)', () => {
  let a: typeof import('@/app/(app)/admin/actions');
  beforeAll(async () => {
    a = await import('@/app/(app)/admin/actions');
    // Cold-start the in-memory DB (pglite boot + migrations) here, not inside a 5 s test, so a loaded
    // parallel run cannot time out the first test that touches it.
    const { getDb } = await import('@/db');
    await getDb();
  }, 60_000);

  it('every id-taking action', async () => {
    for (const bad of BAD) {
      const b = bad as number;
      expect(await a.setPaidAction(b, true), `setPaid entry ${String(bad)}`).toEqual(INVALID);
      expect(await a.adminDeleteEntryAction(b), `deleteEntry ${String(bad)}`).toEqual(INVALID);
      expect(await a.syncNowAction(b), 'syncNow').toEqual(INVALID);
      expect(await a.setLockAction(b, null), 'setLock').toEqual(INVALID);
      expect(await a.overrideGameAction(b, 1, 0, 'home'), 'override').toEqual(INVALID);
      expect(await a.clearOverrideAction(b), 'clearOverride').toEqual(INVALID);
      expect(await a.adminSubmitPicksAction(b, 1, undefined, {}, 40), 'adminSubmit user').toEqual(INVALID);
      expect(await a.adminSubmitPicksAction(1, b, undefined, {}, 40), 'adminSubmit week').toEqual(INVALID);
      expect(await a.adminSubmitPicksAction(1, 1, { entryId: b }, {}, 40), 'adminSubmit entry').toEqual(INVALID);
      expect(await a.resetPinAction(b, '1234'), 'resetPin').toEqual(INVALID);
      expect(await a.setAdminAction(b, true), 'setAdmin').toEqual(INVALID);
      expect(await a.removeUserAction(b), 'removeUser').toEqual(INVALID);
      expect(await a.setEntryFeeAction(b, '10'), 'setEntryFee').toEqual(INVALID);
    }
  });

  it('setEntryFee rejects a non-string or oversized value and reports a bad amount', async () => {
    for (const v of [10, null, undefined, {}, 'x'.repeat(21)]) expect(await a.setEntryFeeAction(1, v as string)).toEqual(INVALID);
    expect(await a.setEntryFeeAction(1, 'ten')).toEqual({ ok: false, error: 'Enter an amount like 10 or 12.50.' });
    expect(await a.setEntryFeeAction(999, '10')).toEqual({ ok: false, error: 'Week not found.' });
  });

  it('a well-formed id for a missing row is a normal error, not a throw', async () => {
    expect(await a.setPaidAction(999, true)).toEqual({ ok: false, error: 'Entry not found.' });
    expect(await a.adminDeleteEntryAction(999)).toEqual({ ok: false, error: 'Entry not found.' });
  });
});

describe('picks action', () => {
  it('rejects a malformed week id or picks object', async () => {
    const { submitPicksAction } = await import('@/app/(app)/picks/actions');
    for (const bad of BAD) expect(await submitPicksAction(bad as number, {}, 40), String(bad)).toEqual({ ok: false, error: 'Invalid request.' });
    expect(await submitPicksAction(1, null as never, 40)).toEqual({ ok: false, error: 'Invalid request.' });
  });

  it('rejects a malformed entry target or entry id', async () => {
    const { deleteEntryAction, submitPicksAction } = await import('@/app/(app)/picks/actions');
    const targets: unknown[] = [...BAD.filter((b) => b !== null && b !== undefined).map((b) => ({ entryId: b })), 'x', [1], { newEntry: 'yes' }, { newEntry: true, entryId: 1 }];
    for (const t of targets) expect(await submitPicksAction(1, {}, 40, t as never), JSON.stringify(t)).toEqual(INVALID);
    for (const bad of BAD) expect(await deleteEntryAction(bad as number), String(bad)).toEqual(INVALID);
  });
});

describe('parseEntryTarget', () => {
  it('accepts omitted, { entryId } and { newEntry: true } only', async () => {
    const { parseEntryTarget } = await import('./validate');
    expect(parseEntryTarget(undefined)).toEqual({});
    expect(parseEntryTarget(null)).toEqual({});
    expect(parseEntryTarget({ entryId: 7 })).toEqual({ entryId: 7 });
    expect(parseEntryTarget({ newEntry: true })).toEqual({ newEntry: true });
    for (const t of [{}, { entryId: 0 }, { entryId: '7' }, { newEntry: false }, { newEntry: true, entryId: 7 }, 5, 'new']) {
      expect(parseEntryTarget(t), JSON.stringify(t)).toBeNull();
    }
  });
});
