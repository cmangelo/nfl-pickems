import { describe, expect, it } from 'vitest';
import { selectEntry } from './entry-select';
import { MAX_ENTRIES_PER_WEEK } from './picks-limits';

const es = [{ entryId: 11 }, { entryId: 12 }, { entryId: 13 }];

describe('selectEntry', () => {
  it('defaults to the first entry; an unknown or foreign id falls back to it', () => {
    expect(selectEntry(es, undefined, undefined)).toMatchObject({ isNew: false, entry: es[0], index: 0, canAdd: true });
    expect(selectEntry(es, '99', undefined)).toMatchObject({ entry: es[0], index: 0 });
    expect(selectEntry(es, ['13', '11'], undefined)).toMatchObject({ entry: es[2], index: 2 });
  });

  it('no entries yet: nothing selected, and "new" is just the first entry form', () => {
    expect(selectEntry([], 'new', undefined)).toEqual({ isNew: false, entry: null, index: -1, copyFrom: null, canAdd: false });
  });

  it('new entry, blank or copied from one of the player\'s entries', () => {
    expect(selectEntry(es, 'new', undefined)).toEqual({ isNew: true, entry: null, index: -1, copyFrom: null, canAdd: true });
    expect(selectEntry(es, 'new', '12').copyFrom).toBe(es[1]);
    expect(selectEntry(es, 'new', '99').copyFrom).toBeNull();
  });

  it('no new entry at the cap or when not allowed (locked week)', () => {
    const full = Array.from({ length: MAX_ENTRIES_PER_WEEK }, (_, i) => ({ entryId: i + 1 }));
    expect(selectEntry(full, 'new', undefined)).toMatchObject({ isNew: false, entry: full[0], canAdd: false });
    expect(selectEntry(es, 'new', undefined, { allowNew: false })).toMatchObject({ isNew: false, entry: es[0], canAdd: false });
  });
});
