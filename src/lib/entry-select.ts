import { MAX_ENTRIES_PER_WEEK } from './picks-limits';

/** Pure: which of a player's entries a picks page shows, from `?entry=<entryId>|new` and `?copy=<entryId>`. */
export interface EntrySelection<E> {
  /** True when showing the "new entry" form. */
  isNew: boolean;
  /** The entry being shown (null when new, or when the player has no entry yet). */
  entry: E | null;
  /** 0-based position of `entry` (-1 when none). */
  index: number;
  /** New-entry form only: the entry whose picks prefill it. */
  copyFrom: E | null;
  /** Another entry may be added (the player has at least one and is under the cap). */
  canAdd: boolean;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function selectEntry<E extends { entryId: number }>(
  entries: E[],
  entryParam: string | string[] | undefined,
  copyParam: string | string[] | undefined,
  { allowNew = true }: { allowNew?: boolean } = {},
): EntrySelection<E> {
  const byId = (v: string | undefined) => entries.find((e) => String(e.entryId) === v) ?? null;
  const canAdd = allowNew && entries.length > 0 && entries.length < MAX_ENTRIES_PER_WEEK;
  if (one(entryParam) === 'new' && canAdd) {
    return { isNew: true, entry: null, index: -1, copyFrom: byId(one(copyParam)), canAdd };
  }
  const entry = byId(one(entryParam)) ?? entries[0] ?? null;
  return { isNew: false, entry, index: entry ? entries.indexOf(entry) : -1, copyFrom: null, canAdd };
}
