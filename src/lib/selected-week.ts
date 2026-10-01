import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { games } from '@/db/schema';
import { now as getNow } from './time';
import { getCurrentWeek, getVisibleWeeks, weekState, type WeekRow, type WeekState } from './weeks';
import { resolveWeekId } from './week-id';

export type GameRow = typeof games.$inferSelect;

export interface WeekWithGames {
  week: WeekRow;
  games: GameRow[];
  state: WeekState;
}

export interface SelectedWeek {
  week: WeekRow | null;
  games: GameRow[];
  state: WeekState | null;
  /** Visible (current + past) weeks, newest first, with their games and state. */
  visibleWeeks: WeekWithGames[];
  /** The current week (latest unlocked), the fallback for the `?week=` param. */
  currentWeek: WeekRow | null;
  now: Date;
}

/** Visible weeks (newest first) with games ordered by kickoff. Future weeks are never included. */
export async function loadVisibleWeeks(at: Date): Promise<WeekWithGames[]> {
  const rows = await getVisibleWeeks(at);
  if (rows.length === 0) return [];
  const db = await getDb();
  const all = await db
    .select()
    .from(games)
    .where(inArray(games.weekId, rows.map((w) => w.id)));
  all.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.id - b.id);
  return rows.map((week) => {
    const g = all.filter((x) => x.weekId === week.id);
    return { week, games: g, state: weekState(week, g, at) };
  });
}

/**
 * Resolves the `?week=<id>` search param. A missing, unknown or not-yet-visible id falls back to the
 * current week. `week` is null when no week has been loaded/unlocked yet.
 */
export async function getSelectedWeek(param: string | string[] | undefined | null, at?: Date): Promise<SelectedWeek> {
  const t = at ?? (await getNow());
  const visibleWeeks = await loadVisibleWeeks(t);
  const currentWeek = await getCurrentWeek(t);
  const id = resolveWeekId(param, visibleWeeks.map((v) => v.week.id), currentWeek?.id ?? null);
  const hit = visibleWeeks.find((v) => v.week.id === id) ?? null;
  return {
    week: hit?.week ?? null,
    games: hit?.games ?? [],
    state: hit?.state ?? null,
    visibleWeeks,
    currentWeek,
    now: t,
  };
}
