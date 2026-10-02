import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, weeks } from '@/db/schema';
import { tiebreakerGame } from './scoring';
import { weekLockAt, weekUnlockAt, type YMD } from './time';

export type WeekState = 'hidden' | 'open' | 'locked' | 'final';

export interface WeekTimes {
  unlockAt: Date;
  lockAt: Date;
  lockOverrideAt?: Date | null;
}

export interface GameStatusLike {
  status: 'scheduled' | 'final' | 'postponed' | 'void';
}

export type WeekRow = typeof weeks.$inferSelect;

/** Effective lock instant: the admin override if set, else the default lock. */
export function effectiveLock(week: Pick<WeekTimes, 'lockAt' | 'lockOverrideAt'>): Date {
  return week.lockOverrideAt ?? week.lockAt;
}

/**
 * hidden: before unlock. open: unlock <= now < lock. locked: after lock, some game not final.
 * final: now >= lock AND every game is final or void (a week with no games is never final).
 * A postponed game keeps the week locked until it is played or voided.
 */
export function weekState(week: WeekTimes, games: GameStatusLike[], now: Date): WeekState {
  const t = now.getTime();
  if (t < week.unlockAt.getTime()) return 'hidden';
  if (t < effectiveLock(week).getTime()) return 'open';
  return games.length > 0 && games.every((g) => g.status === 'final' || g.status === 'void') ? 'final' : 'locked';
}

function addDays(ymd: YMD, days: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** True when the week starting on this Tuesday contains the 4th Thursday of November. */
export function isThanksgivingWeek(tuesday: YMD): boolean {
  const thursday = addDays(tuesday, 2);
  return thursday.month === 11 && thursday.day >= 22 && thursday.day <= 28;
}

/** Default lock for a week: Thu 12:00 PT, or Thu 09:00 PT in Thanksgiving week. */
export function defaultLockAt(tuesday: YMD): Date {
  return weekLockAt(tuesday, isThanksgivingWeek(tuesday) ? 9 : 12);
}

export function defaultUnlockAt(tuesday: YMD): Date {
  return weekUnlockAt(tuesday);
}

// ---------- DB ----------

export type LockResult = { ok: true } | { ok: false; error: string };

/**
 * Sets (or with null clears) the admin lock override. A lock later than the week's first kickoff is
 * refused: picks must never stay open once a game has started. Changing the lock also drops the
 * frozen tiebreaker game so it is recomputed at the new lock.
 */
export async function setWeekLockOverride(weekId: number, at: Date | null): Promise<LockResult> {
  const db = await getDb();
  const [week] = await db.select({ id: weeks.id }).from(weeks).where(eq(weeks.id, weekId));
  if (!week) return { ok: false, error: 'Week not found.' };
  if (at) {
    const rows = await db.select({ kickoffAt: games.kickoffAt }).from(games).where(eq(games.weekId, weekId));
    if (rows.length > 0) {
      const first = rows.reduce((a, b) => (b.kickoffAt < a.kickoffAt ? b : a)).kickoffAt;
      if (at.getTime() > first.getTime()) {
        return { ok: false, error: "The lock can't be later than the week's first kickoff." };
      }
    }
  }
  await db.update(weeks).set({ lockOverrideAt: at, tiebreakerGameId: null }).where(eq(weeks.id, weekId));
  return { ok: true };
}

/**
 * The week's tiebreaker game. Before the lock it is computed live from the games; once
 * now >= the effective lock it is persisted (weeks.tiebreaker_game_id) the first time it is asked
 * for and the stored game is used from then on, so a later flex/reschedule can't change it.
 */
export async function resolveTiebreakerGame<T extends { id: number; kickoffAt: Date }>(
  week: WeekRow,
  weekGames: T[],
  now: Date,
): Promise<T | null> {
  const locked = now.getTime() >= effectiveLock(week).getTime();
  if (!locked) return tiebreakerGame(weekGames);
  const stored = week.tiebreakerGameId == null ? undefined : weekGames.find((g) => g.id === week.tiebreakerGameId);
  if (stored) return stored;
  const computed = tiebreakerGame(weekGames);
  if (computed) {
    const db = await getDb();
    // Only fill when empty (or stale: the stored game is no longer in this week).
    await db
      .update(weeks)
      .set({ tiebreakerGameId: computed.id })
      .where(
        week.tiebreakerGameId == null
          ? and(eq(weeks.id, week.id), isNull(weeks.tiebreakerGameId))
          : and(eq(weeks.id, week.id), eq(weeks.tiebreakerGameId, week.tiebreakerGameId)),
      );
    week.tiebreakerGameId = computed.id;
  }
  return computed;
}

/** The latest week whose unlock <= now, or null if none has opened yet. */
export async function getCurrentWeek(now: Date): Promise<WeekRow | null> {
  const db = await getDb();
  const rows = await db.select().from(weeks).where(lte(weeks.unlockAt, now)).orderBy(desc(weeks.unlockAt)).limit(1);
  return rows[0] ?? null;
}

/** Current + past weeks, newest first. Future weeks are never returned. */
export async function getVisibleWeeks(now: Date): Promise<WeekRow[]> {
  const db = await getDb();
  return db.select().from(weeks).where(lte(weeks.unlockAt, now)).orderBy(desc(weeks.unlockAt));
}

/** The visible week immediately before `week` (by unlock time), if any. */
export async function getPreviousWeek(week: WeekRow): Promise<WeekRow | null> {
  const db = await getDb();
  const rows = await db.select().from(weeks).orderBy(desc(weeks.unlockAt));
  return rows.find((w) => w.unlockAt.getTime() < week.unlockAt.getTime()) ?? null;
}
