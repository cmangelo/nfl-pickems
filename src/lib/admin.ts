import { and, eq, inArray } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { getDb } from '@/db';
import { entries, sessions, users, weeks } from '@/db/schema';
import { validatePin } from './auth';
import { hashPin } from './pin';
import { MAX_FEE_CENTS } from './pot';
import { PT, ptWallTimeToUtc } from './time';
import { weekState } from './weeks';

export type AdminResult = { ok: true } | { ok: false; error: string };

/** Value for an `<input type="datetime-local">` showing `instant` in Pacific Time ("2026-10-08T12:00"). */
export function toPtInputValue(instant: Date): string {
  return formatInTimeZone(instant, PT, "yyyy-MM-dd'T'HH:mm");
}

/** Parses a datetime-local value as a Pacific Time wall clock (DST-correct) into a UTC instant; null if invalid. */
export function fromPtInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const d = ptWallTimeToUtc({ year, month, day }, hour, minute);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sets the paid flag on one entry (each entry is a separate fee). False if there is no such entry. */
export async function setPaid(entryId: number, paid: boolean): Promise<boolean> {
  const db = await getDb();
  const rows = await db.update(entries).set({ paid }).where(eq(entries.id, entryId)).returning({ id: entries.id });
  return rows.length > 0;
}

/** Sets (or with null clears) a week's own entry fee in cents; later weeks without one carry it over. */
export async function setEntryFee(weekId: number, cents: number | null): Promise<boolean> {
  if (cents !== null && !(Number.isInteger(cents) && cents >= 0 && cents <= MAX_FEE_CENTS)) return false;
  const db = await getDb();
  const rows = await db.update(weeks).set({ entryFeeCents: cents }).where(eq(weeks.id, weekId)).returning({ id: weeks.id });
  return rows.length > 0;
}

/** Sets a new 4-digit PIN and clears any login lockout. */
export async function resetPin(userId: number, pin: string): Promise<AdminResult> {
  const err = validatePin(pin);
  if (err) return { ok: false, error: err };
  const db = await getDb();
  const rows = await db
    .update(users)
    .set({ pinHash: await hashPin(pin), failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return rows.length ? { ok: true } : { ok: false, error: 'User not found.' };
}

/** Grants or revokes admin. An admin cannot change their own role (keeps at least one admin). */
export async function setAdmin(actorId: number, userId: number, isAdmin: boolean): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, error: "You can't change your own admin status." };
  const db = await getDb();
  const rows = await db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning({ id: users.id });
  return rows.length ? { ok: true } : { ok: false, error: 'User not found.' };
}

/**
 * Soft-removes a player: sets users.deactivated_at, deletes their sessions and drops their entry for the
 * currently OPEN week(s) only (they are out). Entries and picks of locked/final weeks are kept so past
 * results never change; the username stays reserved. Login must refuse deactivated users.
 * An admin cannot remove themselves.
 */
export async function removeUser(actorId: number, userId: number, at: Date): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, error: "You can't remove yourself." };
  const db = await getDb();
  const [u] = await db.select({ id: users.id, deactivatedAt: users.deactivatedAt }).from(users).where(eq(users.id, userId));
  if (!u || u.deactivatedAt) return { ok: false, error: 'User not found.' };
  const openWeekIds = (await db.select().from(weeks)).filter((w) => weekState(w, [], at) === 'open').map((w) => w.id);
  // Deactivate last so a partial failure can simply be retried.
  if (openWeekIds.length > 0) {
    await db.delete(entries).where(and(eq(entries.userId, userId), inArray(entries.weekId, openWeekIds))); // picks cascade
  }
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.update(users).set({ deactivatedAt: at }).where(eq(users.id, userId));
  return { ok: true };
}

/** Active players by default; pass includeDeactivated to also get removed ones. */
export async function listUsers({ includeDeactivated = false }: { includeDeactivated?: boolean } = {}) {
  const db = await getDb();
  const rows = await db.select().from(users);
  return rows
    .filter((u) => includeDeactivated || !u.deactivatedAt)
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.id - b.id);
}
