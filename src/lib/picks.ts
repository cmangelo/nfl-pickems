import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, games, picks, users, weeks } from '@/db/schema';
import type { Side } from './scoring';
import { weekState } from './weeks';

export { tiebreakerGame } from './scoring';

export const MAX_TIEBREAKER = 200;

export interface PicksInput {
  picks: Record<number, Side>;
  tiebreaker: number;
}

export type SubmitError = 'week_not_found' | 'week_not_open' | 'incomplete' | 'invalid_pick' | 'invalid_tiebreaker';

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
}

export interface WeekEntry extends EntryRecord {
  firstName: string;
  username: string;
}

const fail = (error: SubmitError, message: string): SubmitResult => ({ ok: false, error, message });

/**
 * Creates or replaces a user's entry for a week. Requires a pick for every game of the week and an
 * integer tiebreaker in 0..200. Rejected unless the week is open (admins may bypass with asAdmin).
 * `paid` is never touched here (defaults to false on create).
 */
export async function submitPicks(
  userId: number,
  weekId: number,
  input: PicksInput,
  { now, asAdmin = false }: { now: Date; asAdmin?: boolean },
): Promise<SubmitResult> {
  const db = await getDb();
  const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));
  if (!week) return fail('week_not_found', 'Week not found.');
  const weekGames = await db.select({ id: games.id, status: games.status }).from(games).where(eq(games.weekId, weekId));

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

  const [entry] = await db
    .insert(entries)
    .values({ weekId, userId, tiebreaker, submittedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [entries.weekId, entries.userId], set: { tiebreaker, updatedAt: now } })
    .returning({ id: entries.id });

  // Every game of the week is covered, so one upsert fully replaces the previous picks.
  await db
    .insert(picks)
    .values(weekGames.map((g) => ({ entryId: entry.id, gameId: g.id, pick: input.picks[g.id] })))
    .onConflictDoUpdate({ target: [picks.entryId, picks.gameId], set: { pick: sql`excluded.pick` } });

  return { ok: true, entryId: entry.id };
}

function toRecord(
  e: typeof entries.$inferSelect,
  pickRows: { entryId: number; gameId: number; pick: Side }[],
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
  };
}

export async function getEntry(userId: number, weekId: number): Promise<EntryRecord | null> {
  const db = await getDb();
  const [e] = await db.select().from(entries).where(and(eq(entries.userId, userId), eq(entries.weekId, weekId)));
  if (!e) return null;
  const rows = await db.select().from(picks).where(eq(picks.entryId, e.id));
  return toRecord(e, rows);
}

/** All entries for a week (paid or not), with user names, ordered by first name. */
export async function listEntries(weekId: number): Promise<WeekEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({ entry: entries, firstName: users.firstName, username: users.username })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.userId))
    .where(eq(entries.weekId, weekId));
  const pickRows = await db
    .select({ entryId: picks.entryId, gameId: picks.gameId, pick: picks.pick })
    .from(picks)
    .innerJoin(entries, eq(entries.id, picks.entryId))
    .where(eq(entries.weekId, weekId));
  return rows
    .map((r) => ({ ...toRecord(r.entry, pickRows), firstName: r.firstName, username: r.username }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.userId - b.userId);
}
