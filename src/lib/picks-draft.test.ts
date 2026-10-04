import { describe, expect, it } from 'vitest';
import { draftKey, draftKeyWeek, makeDraft, readDraft, serializeDraftState } from './picks-draft';

const saved = serializeDraftState({ picks: { 1: 'home', 2: 'away' }, tb: '41' });
const ids = [1, 2, 3];

describe('draftKey', () => {
  it('is per user, week and entry target', () => {
    expect(draftKey(7, 3, { entryId: 12 })).toBe('pickems:draft:v1:7:3:e12');
    expect(draftKey(7, 3, { first: true })).toBe('pickems:draft:v1:7:3:first');
    expect(draftKey(7, 3, { newEntry: true })).toBe('pickems:draft:v1:7:3:new');
    expect(draftKey(7, 3, { newEntry: true, copyOf: 12 })).toBe('pickems:draft:v1:7:3:new-c12');
  });
  it('draftKeyWeek reads the week back only from this user\'s keys', () => {
    expect(draftKeyWeek('pickems:draft:v1:7:3:e12', 7)).toBe(3);
    expect(draftKeyWeek('pickems:draft:v1:17:3:e12', 7)).toBeNull();
    expect(draftKeyWeek('pickems:draft:v1:7:x:e12', 7)).toBeNull();
    expect(draftKeyWeek('other', 7)).toBeNull();
  });
});

describe('serializeDraftState', () => {
  it('ignores pick order', () => {
    expect(serializeDraftState({ picks: { 2: 'away', 1: 'home' }, tb: '41' })).toBe(saved);
    expect(serializeDraftState({ picks: { 1: 'home' }, tb: '41' })).not.toBe(saved);
    expect(serializeDraftState({ picks: { 1: 'home', 2: 'away' }, tb: '40' })).not.toBe(saved);
  });
});

describe('readDraft', () => {
  const changed = { picks: { 1: 'away' as const, 2: 'away' as const, 3: 'home' as const }, tb: '38' };

  it('offers a draft started from the same saved entry', () => {
    expect(readDraft(makeDraft(saved, changed), saved, ids)).toEqual(changed);
  });

  it('drops a stale draft: the entry was saved again since (another device or an admin edit)', () => {
    const savedSince = serializeDraftState({ picks: { 1: 'home', 2: 'home' }, tb: '41' });
    expect(readDraft(makeDraft(saved, changed), savedSince, ids)).toBeNull();
  });

  it('nothing to offer when the draft equals the saved entry', () => {
    expect(readDraft(makeDraft(saved, { picks: { 2: 'away', 1: 'home' }, tb: '41' }), saved, ids)).toBeNull();
  });

  it('drops picks for games not on the form and junk values; cleans the tiebreaker', () => {
    const raw = JSON.stringify({ v: 1, base: saved, picks: { 1: 'away', 9: 'home', 2: 'left', x: 'home' }, tb: '4a5678' });
    expect(readDraft(raw, saved, ids)).toEqual({ picks: { 1: 'away' }, tb: '456' });
  });

  it('ignores missing, unparsable and other-version drafts', () => {
    expect(readDraft(null, saved, ids)).toBeNull();
    expect(readDraft('{not json', saved, ids)).toBeNull();
    expect(readDraft('null', saved, ids)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 2, base: saved, picks: {}, tb: '' }), saved, ids)).toBeNull();
    expect(readDraft(JSON.stringify({ v: 1, base: saved, picks: [], tb: 5 }), saved, ids)).toBeNull();
  });
});
