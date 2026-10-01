import { and, eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { getDb } from '@/db';
import { entries, sessions, users } from '@/db/schema';
import { validatePin } from './auth';
import { hashPin } from './pin';
import { PT, ptWallTimeToUtc } from './time';

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

/** Sets the paid flag on a user's entry for a week. False if there is no such entry. */
export async function setPaid(userId: number, weekId: number, paid: boolean): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(entries)
    .set({ paid })
    .where(and(eq(entries.userId, userId), eq(entries.weekId, weekId)))
    .returning({ id: entries.id });
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

/** Deletes a user with their sessions, entries and picks. An admin cannot remove themselves. */
export async function removeUser(actorId: number, userId: number): Promise<AdminResult> {
  if (actorId === userId) return { ok: false, error: "You can't remove yourself." };
  const db = await getDb();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: 'User not found.' };
  // picks cascade from entries; sessions/entries are deleted explicitly too for clarity.
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(entries).where(eq(entries.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  return { ok: true };
}

export async function listUsers() {
  const db = await getDb();
  const rows = await db.select().from(users);
  return rows.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.id - b.id);
}
