/** Largest value of a Postgres `integer` column (serial ids). Anything above would raise a DB error. */
const MAX_INT4 = 2147483647;

/** True for a positive integer that fits an `integer` id column. Server actions get arbitrary client input. */
export function isId(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAX_INT4;
}

/**
 * Validates the entry target sent by the picks forms: omitted = the player's first entry,
 * `{ entryId }` = that entry, `{ newEntry: true }` = add an entry. Null when malformed.
 */
export function parseEntryTarget(t: unknown): { entryId?: number; newEntry?: boolean } | null {
  if (t === undefined || t === null) return {};
  if (typeof t !== 'object' || Array.isArray(t)) return null;
  const { entryId, newEntry } = t as { entryId?: unknown; newEntry?: unknown };
  if (newEntry === true && entryId === undefined) return { newEntry: true };
  if (newEntry === undefined && isId(entryId)) return { entryId };
  return null;
}
