import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { alias } from 'drizzle-orm/pg-core';
import { entries, games, picks, users, weeks } from '@/db/schema';
import type { Side } from './scoring';
import { effectiveLock, resolveTiebreakerGame, weekState } from './weeks';

export { tiebreakerGame } from './scoring';

export const MAX_TIEBREAKER = 200;

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
  | 'game_started';

export type SubmitResult =
  | { ok: true; entryId: number }
  | { ok: false; error: SubmitError; message: string };

export interface EntryRecord {
  entryId: number;
  userId: number;
  weekId: number;
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
}

const fail = (error: SubmitError, message: string): SubmitResult => ({ ok: false, error, message });

/**
 * Creates or replaces a user's entry for a week. Requires a pick for every game of the week and an
 * integer tiebreaker in 0..200. Rejected unless the week is open (admins may bypass with asAdmin).
 * Non-admin saves may not add or change the pick for a game that has already kicked off.
 * `paid` is never touched here (defaults to false on create).
 *
 * `actorId` is the acting admin (asAdmin only). An edit of someone else's entry, or of the admin's own
 * entry after the lock, is recorded on the entry (edited_by_admin_id / admin_edited_at).
 * The entry upsert and the picks upsert are one atomic statement.
 */
export async function submitPicks(
  userId: number,
  weekId: number,
  input: PicksInput,
  { now, asAdmin = false, actorId }: { now: Date; asAdmin?: boolean; actorId?: number },
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

  if (!asAdmin) {
    const started = weekGames.filter((g) => g.kickoffAt.getTime() <= now.getTime());
    if (started.length > 0) {
      const stored = (await getEntry(userId, weekId))?.picks ?? {};
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
  // One statement = atomic on every driver (neon-http has no interactive transactions). Every game of
  // the week is covered, so the picks upsert fully replaces the previous picks.
  await db.execute(sql`
    WITH e AS (
      INSERT INTO entries (week_id, user_id, tiebreaker, submitted_at, updated_at, edited_by_admin_id, admin_edited_at)
      VALUES (${weekId}::integer, ${userId}::integer, ${tiebreaker}::integer, ${ts}::timestamptz, ${ts}::timestamptz,
              ${adminId}::integer, ${adminAt}::timestamptz)
      ON CONFLICT (week_id, user_id) DO UPDATE SET
        tiebreaker = excluded.tiebreaker,
        updated_at = excluded.updated_at,
        edited_by_admin_id = COALESCE(excluded.edited_by_admin_id, entries.edited_by_admin_id),
        admin_edited_at = COALESCE(excluded.admin_edited_at, entries.admin_edited_at)
      RETURNING id
    )
    INSERT INTO picks (entry_id, game_id, pick)
    SELECT e.id, v.game_id, v.pick FROM e CROSS JOIN (VALUES ${sql.join(pickRows, sql`, `)}) AS v(game_id, pick)
    ON CONFLICT (entry_id, game_id) DO UPDATE SET pick = excluded.pick
  `);

  const [entry] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.weekId, weekId), eq(entries.userId, userId)));
  return { ok: true, entryId: entry.id };
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

export async function getEntry(userId: number, weekId: number): Promise<EntryRecord | null> {
  const db = await getDb();
  const editor = alias(users, 'editor');
  const [r] = await db
    .select({ entry: entries, editedByName: editor.firstName })
    .from(entries)
    .leftJoin(editor, eq(editor.id, entries.editedByAdminId))
    .where(and(eq(entries.userId, userId), eq(entries.weekId, weekId)));
  if (!r) return null;
  const rows = await db.select().from(picks).where(eq(picks.entryId, r.entry.id));
  return toRecord(r.entry, rows, r.editedByName);
}

/** All entries for a week (paid or not), with user names, ordered by first name. */
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
  return rows
    .map((r) => ({ ...toRecord(r.entry, pickRows, r.editedByName), firstName: r.firstName, username: r.username }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.userId - b.userId);
}
