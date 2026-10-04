import type { Side } from './scoring';

/**
 * Unsaved picks kept in this browser (localStorage) so leaving the picks page half-way loses nothing.
 * Client-safe (no server imports). A draft is only ever offered back, never applied or submitted on its own,
 * and only while the saved entry is exactly what it was when the draft started (`base`): if the entry was
 * saved since (another device, an admin edit), the draft is stale and dropped.
 */

const PREFIX = 'pickems:draft:v1';

export interface DraftState {
  picks: Record<number, Side>;
  /** Raw tiebreaker input ("" when empty). */
  tb: string;
}

interface StoredDraft {
  v: 1;
  /** `serializeDraftState` of the saved entry the draft was started from. */
  base: string;
  picks: Record<string, Side>;
  tb: string;
}

/** Which entry a draft belongs to: an existing entry, the player's first entry, or a new one (optionally a copy). */
export type DraftTarget = { entryId: number } | { first: true } | { newEntry: true; copyOf?: number };

export function draftKeyPrefix(userId: number): string {
  return `${PREFIX}:${userId}:`;
}

export function draftKey(userId: number, weekId: number, target: DraftTarget): string {
  const t =
    'entryId' in target ? `e${target.entryId}` : 'first' in target ? 'first' : `new${target.copyOf ? `-c${target.copyOf}` : ''}`;
  return `${draftKeyPrefix(userId)}${weekId}:${t}`;
}

/** The week a draft key belongs to, or null when it is not one of this user's draft keys. */
export function draftKeyWeek(key: string, userId: number): number | null {
  const prefix = draftKeyPrefix(userId);
  if (!key.startsWith(prefix)) return null;
  const n = Number(key.slice(prefix.length).split(':')[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Canonical string for a form state (pick order does not matter). */
export function serializeDraftState({ picks, tb }: DraftState): string {
  const sorted = Object.entries(picks)
    .filter(([, side]) => side === 'home' || side === 'away')
    .sort(([a], [b]) => Number(a) - Number(b));
  return JSON.stringify([sorted, tb]);
}

export function makeDraft(base: string, state: DraftState): string {
  const draft: StoredDraft = { v: 1, base, picks: state.picks, tb: state.tb };
  return JSON.stringify(draft);
}

/**
 * The draft to offer, or null when there is none worth offering: unreadable, from another version, started
 * from a different saved entry than `base` (stale), or identical to the saved entry. Picks for games that are
 * not on the form are dropped; the tiebreaker is cleaned like the input does.
 */
export function readDraft(raw: string | null, base: string, gameIds: number[]): DraftState | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  const { v, base: draftBase, picks, tb } = d as Partial<StoredDraft>;
  if (v !== 1 || draftBase !== base || !picks || typeof picks !== 'object' || typeof tb !== 'string') return null;
  const ids = new Set(gameIds);
  const clean: Record<number, Side> = {};
  for (const [k, side] of Object.entries(picks)) {
    const id = Number(k);
    if (ids.has(id) && (side === 'home' || side === 'away')) clean[id] = side;
  }
  const state = { picks: clean, tb: tb.replace(/\D/g, '').slice(0, 3) };
  if (serializeDraftState(state) === base) return null;
  return state;
}
