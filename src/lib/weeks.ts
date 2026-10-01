import { desc, eq, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { weeks } from '@/db/schema';
import { weekLockAt, weekUnlockAt, type YMD } from './time';

export type WeekState = 'hidden' | 'open' | 'locked' | 'final';

export interface WeekTimes {
  unlockAt: Date;
  lockAt: Date;
  lockOverrideAt?: Date | null;
}

export interface GameStatusLike {
  status: 'scheduled' | 'final';
}

export type WeekRow = typeof weeks.$inferSelect;

/** Effective lock instant: the admin override if set, else the default lock. */
export function effectiveLock(week: Pick<WeekTimes, 'lockAt' | 'lockOverrideAt'>): Date {
  return week.lockOverrideAt ?? week.lockAt;
}

/**
 * hidden: before unlock. open: unlock <= now < lock. locked: after lock, some game not final.
 * final: now >= lock AND every game is final (a week with no games is never final).
 */
export function weekState(week: WeekTimes, games: GameStatusLike[], now: Date): WeekState {
  const t = now.getTime();
  if (t < week.unlockAt.getTime()) return 'hidden';
  if (t < effectiveLock(week).getTime()) return 'open';
  return games.length > 0 && games.every((g) => g.status === 'final') ? 'final' : 'locked';
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

export async function setWeekLockOverride(weekId: number, at: Date | null): Promise<void> {
  const db = await getDb();
  await db.update(weeks).set({ lockOverrideAt: at }).where(eq(weeks.id, weekId));
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
