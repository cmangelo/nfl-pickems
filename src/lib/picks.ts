import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { alias } from 'drizzle-orm/pg-core';
import { entries, games, picks, users, weeks } from '@/db/schema';
import type { Side } from './scoring';
import { effectiveLock, resolveTiebreakerGame, weekState } from './weeks';
import { entryLabel } from './week-view';
import { MAX_ENTRIES_PER_WEEK } from './picks-limits';

export { tiebreakerGame } from './scoring';

export const MAX_TIEBREAKER = 200;
export { MAX_ENTRIES_PER_WEEK } from './picks-limits';

export interface PicksInput {
  picks: Record<number, Side>;
  tiebreaker: number;
}

export type SubmitError =
  | 'week_not_found'
  | 'week_not_open'
  | 'incomplete'
  | 'invalid_pick'
  | 'invalid_tiebreaker'
  | 'game_started'
  | 'entry_not_found'
  | 'entry_limit';

export type SubmitResult =
  | { ok: true; entryId: number }
  | { ok: false; error: SubmitError; message: string };

export interface EntryRecord {
  entryId: number;
  userId: number;
  weekId: number;
  /** Slot 1..MAX_ENTRIES_PER_WEEK, unique per (week, user); entries are listed in this order. */
  entryNo: number;
  tiebreaker: number;
  paid: boolean;
  submittedAt: Date;
  updatedAt: Date;
  picks: Record<number, Side>;
  /** Audit: admin who last edited this entry for the player (first name), and when. */
  editedByAdminId: number | null;
  editedByName: string | null;
  adminEditedAt: Date | null;
}

export interface WeekEntry extends EntryRecord {
  firstName: string;
  username: string;
  /** 0-based position among this player's entries for the week, and how many they have. */
  entryIndex: number;
  entryCount: number;
  /** "Chris", or "Chris (2)" when the player has several entries. */
  label: string;
}

/**
 * Which of the player's entries a save targets: an existing one by id, a brand-new one, or (neither)
 * their first entry, created as entry 1 if they have none.
 */
export interface EntryTarget {
  entryId?: number;
  newEntry?: boolean;
}

const fail = (error: SubmitError, message: string): SubmitResult => ({ ok: false, error, message });

/**
 * Creates or replaces one of a user's entries for a week. Requires a pick for every game of the week and
 * an integer tiebreaker in 0..200. Rejected unless the week is open (admins may bypass with asAdmin).
 * Non-admin saves may not add or change the pick for a game that has already kicked off (so a new entry
 * can't be added once any game has started).
 * `paid` is never touched here (defaults to false on create).
 *
 * Target: `entryId` (must be this user's entry for this week) | `newEntry` (takes the lowest free slot,
 * up to MAX_ENTRIES_PER_WEEK) | neither = the user's first entry, created as entry 1 if they have none.
 *
 * `actorId` is the acting admin (asAdmin only). An edit of someone else's entry, or of the admin's own
 * entry after the lock, is recorded on the entry (edited_by_admin_id / admin_edited_at).
 * The entry write and the picks upsert are one atomic statement.
 */
export async function submitPicks(
  userId: number,
  weekId: number,
  input: PicksInput,
  { now, asAdmin = false, actorId, entryId, newEntry = false }: { now: Date; asAdmin?: boolean; actorId?: number } & EntryTarget,
): Promise<SubmitResult> {
  const db = await getDb();
  const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));
  if (!week) return fail('week_not_found', 'Week not found.');
  const weekGames = await db
    .select({ id: games.id, status: games.status, kickoffAt: games.kickoffAt })
    .from(games)
    .where(eq(games.weekId, weekId));

  if (!asAdmin && weekState(week, weekGames, now) !== 'open') return fail('week_not_open', 'Picks are closed for this week.');

  const { tiebreaker } = input;
  if (!Number.isInteger(tiebreaker) || tiebreaker < 0 || tiebreaker > MAX_TIEBREAKER) {
    return fail('invalid_tiebreaker', `Tiebreaker must be a whole number from 0 to ${MAX_TIEBREAKER}.`);
  }
  if (weekGames.length === 0) return fail('incomplete', 'This week has no games.');
  const ids = new Set(weekGames.map((g) => g.id));
  for (const [k, v] of Object.entries(input.picks)) {
    if (!ids.has(Number(k))) return fail('invalid_pick', `Game ${k} is not in this week.`);
    if (v !== 'home' && v !== 'away') return fail('invalid_pick', `Invalid pick for game ${k}.`);
  }
  if (weekGames.some((g) => input.picks[g.id] === undefined)) return fail('incomplete', 'Pick every game.');

  // Resolve the target entry (null = create).
  const mine = await getEntries(userId, weekId);
  let target: EntryRecord | null;
  if (entryId !== undefined) {
    target = mine.find((e) => e.entryId === entryId) ?? null;
    if (!target) return fail('entry_not_found', 'Entry not found.');
  } else if (newEntry) {
    if (mine.length >= MAX_ENTRIES_PER_WEEK) return entryLimit();
    target = null;
  } else {
    target = mine[0] ?? null;
  }

  if (!asAdmin) {
    const started = weekGames.filter((g) => g.kickoffAt.getTime() <= now.getTime());
    if (started.length > 0) {
      const stored = target?.picks ?? {};
      if (started.some((g) => stored[g.id] !== input.picks[g.id])) {
        return fail('game_started', "Picks for games that already started can't be changed.");
      }
    }
  }

  await resolveTiebreakerGame(week, weekGames, now); // freezes the tiebreaker game once locked

  // An admin's own pre-lock save is an ordinary entry; after the lock it is flagged like any admin edit.
  const audit =
    asAdmin && actorId !== undefined && (actorId !== userId || now.getTime() >= effectiveLock(week).getTime());
  const ts = now.toISOString();
  const adminId = audit ? actorId : null;
  const adminAt = audit ? ts : null;
  const pickRows = weekGames.map((g) => sql`(${g.id}::integer, ${input.picks[g.id]}::text)`);

  let entryCte;
  if (target) {
    entryCte = sql`
      UPDATE entries SET
        tiebreaker = ${tiebreaker}::integer,
        updated_at = ${ts}::timestamptz,
        edited_by_admin_id = COALESCE(${adminId}::integer, edited_by_admin_id),
        admin_edited_at = COALESCE(${adminAt}::timestamptz, admin_edited_at)
      WHERE id = ${target.entryId}::integer AND user_id = ${userId}::integer AND week_id = ${weekId}::integer
      RETURNING id`;
  } else if (newEntry) {
    // Lowest free slot; none free (or a concurrent save took it) => no row => entry_limit below.
    entryCte = sql`
      INSERT INTO entries (week_id, user_id, entry_no, tiebreaker, submitted_at, updated_at, edited_by_admin_id, admin_edited_at)
      SELECT ${weekId}::integer, ${userId}::integer, n, ${tiebreaker}::integer, ${ts}::timestamptz, ${ts}::timestamptz,
             ${adminId}::integer, ${adminAt}::timestamptz
      FROM generate_series(1, ${MAX_ENTRIES_PER_WEEK}::integer) AS n
      WHERE n NOT IN (SELECT entry_no FROM entries WHERE week_id = ${weekId}::integer AND user_id = ${userId}::integer)
      ORDER BY n
      LIMIT 1
      ON CONFLICT (week_id, user_id, entry_no) DO NOTHING
      RETURNING id`;
  } else {
    // First entry: a concurrent first save lands on the same row.
    entryCte = sql`
      INSERT INTO entries (week_id, user_id, entry_no, tiebreaker, submitted_at, updated_at, edited_by_admin_id, admin_edited_at)
      VALUES (${weekId}::integer, ${userId}::integer, 1, ${tiebreaker}::integer, ${ts}::timestamptz, ${ts}::timestamptz,
              ${adminId}::integer, ${adminAt}::timestamptz)
      ON CONFLICT (week_id, user_id, entry_no) DO UPDATE SET
        tiebreaker = excluded.tiebreaker,
        updated_at = excluded.updated_at,
        edited_by_admin_id = COALESCE(excluded.edited_by_admin_id, entries.edited_by_admin_id),
        admin_edited_at = COALESCE(excluded.admin_edited_at, entries.admin_edited_at)
      RETURNING id`;
  }
  // One statement = atomic on every driver (neon-http has no interactive transactions). Every game of
  // the week is covered, so the picks upsert fully replaces the previous picks.
  const res = await db.execute(sql`
    WITH e AS (${entryCte}),
    p AS (
      INSERT INTO picks (entry_id, game_id, pick)
      SELECT e.id, v.game_id, v.pick FROM e CROSS JOIN (VALUES ${sql.join(pickRows, sql`, `)}) AS v(game_id, pick)
      ON CONFLICT (entry_id, game_id) DO UPDATE SET pick = excluded.pick
    )
    SELECT id FROM e
  `);
  const id = Number((res as unknown as { rows: { id: number }[] }).rows[0]?.id);
  if (!id) return target ? fail('entry_not_found', 'Entry not found.') : entryLimit();
  return { ok: true, entryId: id };
}

const entryLimit = () =>
  fail('entry_limit', `You can have at most ${MAX_ENTRIES_PER_WEEK} entries in a week.`);

export type DeleteEntryResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes one entry (its picks cascade). A player may delete their own entry only while the week is open
 * and only if they keep at least one; an admin (asAdmin) may delete any entry at any time.
 */
export async function deleteEntry(
  entryId: number,
  { now, asAdmin = false, userId }: { now: Date; asAdmin?: boolean; userId?: number },
): Promise<DeleteEntryResult> {
  const db = await getDb();
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry || (!asAdmin && entry.userId !== userId)) return { ok: false, error: 'Entry not found.' };
  if (asAdmin) {
    await db.delete(entries).where(eq(entries.id, entryId));
    return { ok: true };
  }
  const [week] = await db.select().from(weeks).where(eq(weeks.id, entry.weekId));
  const weekGames = await db.select({ status: games.status }).from(games).where(eq(games.weekId, entry.weekId));
  if (!week || weekState(week, weekGames, now) !== 'open') return { ok: false, error: 'Picks are closed for this week.' };
  // One statement: refuses to remove the player's last entry even if two deletes race.
  const rows = await db
    .delete(entries)
    .where(
      and(
        eq(entries.id, entryId),
        sql`(SELECT count(*) FROM entries e2 WHERE e2.week_id = ${entry.weekId} AND e2.user_id = ${entry.userId}) > 1`,
      ),
    )
    .returning({ id: entries.id });
  return rows.length ? { ok: true } : { ok: false, error: "You can't remove your only entry." };
}

function toRecord(
  e: typeof entries.$inferSelect,
  pickRows: { entryId: number; gameId: number; pick: Side }[],
  editedByName: string | null = null,
): EntryRecord {
  const map: Record<number, Side> = {};
  for (const p of pickRows) if (p.entryId === e.id) map[p.gameId] = p.pick;
  return {
    entryId: e.id,
    userId: e.userId,
    weekId: e.weekId,
    entryNo: e.entryNo,
    tiebreaker: e.tiebreaker,
    paid: e.paid,
    submittedAt: e.submittedAt,
    updatedAt: e.updatedAt,
    picks: map,
    editedByAdminId: e.editedByAdminId,
    editedByName: e.adminEditedAt ? editedByName : null,
    adminEditedAt: e.adminEditedAt,
  };
}

/** A user's entries for a week, in entry order (empty if they have none). */
export async function getEntries(userId: number, weekId: number): Promise<EntryRecord[]> {
  const db = await getDb();
  const editor = alias(users, 'editor');
  const rows = await db
    .select({ entry: entries, editedByName: editor.firstName })
    .from(entries)
    .leftJoin(editor, eq(editor.id, entries.editedByAdminId))
    .where(and(eq(entries.userId, userId), eq(entries.weekId, weekId)))
    .orderBy(entries.entryNo);
  if (rows.length === 0) return [];
  const pickRows = await db
    .select({ entryId: picks.entryId, gameId: picks.gameId, pick: picks.pick })
    .from(picks)
    .where(inArray(picks.entryId, rows.map((r) => r.entry.id)));
  return rows.map((r) => toRecord(r.entry, pickRows, r.editedByName));
}

/** The user's first entry for a week, or null. */
export async function getEntry(userId: number, weekId: number): Promise<EntryRecord | null> {
  return (await getEntries(userId, weekId))[0] ?? null;
}

/** All entries for a week (paid or not), with user names and entry labels, ordered by first name then entry. */
export async function listEntries(weekId: number): Promise<WeekEntry[]> {
  const db = await getDb();
  const editor = alias(users, 'editor');
  const rows = await db
    .select({ entry: entries, firstName: users.firstName, username: users.username, editedByName: editor.firstName })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.userId))
    .leftJoin(editor, eq(editor.id, entries.editedByAdminId))
    .where(eq(entries.weekId, weekId));
  const pickRows = await db
    .select({ entryId: picks.entryId, gameId: picks.gameId, pick: picks.pick })
    .from(picks)
    .innerJoin(entries, eq(entries.id, picks.entryId))
    .where(eq(entries.weekId, weekId));
  const list = rows
    .map((r) => ({ ...toRecord(r.entry, pickRows, r.editedByName), firstName: r.firstName, username: r.username }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.userId - b.userId || a.entryNo - b.entryNo);
  const count = new Map<number, number>();
  for (const e of list) count.set(e.userId, (count.get(e.userId) ?? 0) + 1);
  const seen = new Map<number, number>();
  return list.map((e) => {
    const entryIndex = seen.get(e.userId) ?? 0;
    seen.set(e.userId, entryIndex + 1);
    const entryCount = count.get(e.userId)!;
    return { ...e, entryIndex, entryCount, label: entryLabel(e.firstName, entryIndex, entryCount) };
  });
}
