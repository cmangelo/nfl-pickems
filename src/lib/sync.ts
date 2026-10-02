import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, syncState } from '@/db/schema';
import { getEspnClient, type EspnClient } from './espn';
import { upsertScoreboardGames } from './schedule';
import { getCurrentWeek, getPreviousWeek, getVisibleWeeks, weekState, type WeekRow } from './weeks';

export const SYNC_KEY = 'scores';
export const REFRESH_WINDOW_MS = 5 * 60 * 1000;
/** Minimum gap between attempts in this process after a failed sync (avoid hammering ESPN on every view). */
const FAILURE_BACKOFF_MS = 60 * 1000;

/**
 * Pulls the scoreboard for the current week and every other visible week that is not final yet (so a
 * late result, e.g. a rescheduled game, is still picked up), and updates kickoff times, final scores,
 * winners and postponements. `force` also re-syncs the previous week even when it is final. Only weeks of
 * the current week's season are synced. Games with manual_override keep their scores/winner.
 * Records sync_state 'scores'.
 */
export async function syncScores({
  client,
  now,
  force = false,
}: {
  client: EspnClient;
  now: Date;
  force?: boolean;
}): Promise<{ weeksSynced: number[]; games: number }> {
  const db = await getDb();
  const current = await getCurrentWeek(now);
  const targets: WeekRow[] = [];
  if (current) {
    targets.push(current);
    const prev = await getPreviousWeek(current);
    const visible = await getVisibleWeeks(now); // newest first
    const rows = await db.select({ weekId: games.weekId, status: games.status }).from(games);
    for (const w of visible) {
      if (w.id === current.id || w.season !== current.season) continue;
      const wg = rows.filter((r) => r.weekId === w.id);
      const nonFinal = wg.length > 0 && weekState(w, wg, now) !== 'final';
      if (nonFinal || (force && prev?.id === w.id)) targets.push(w);
    }
  }
  let count = 0;
  for (const w of targets) {
    const sb = await client.getScoreboard({ season: w.season, week: w.weekNumber });
    count += await upsertScoreboardGames(db, w.id, sb);
  }
  await db
    .insert(syncState)
    .values({ key: SYNC_KEY, lastSyncedAt: now })
    .onConflictDoUpdate({ target: syncState.key, set: { lastSyncedAt: now } });
  return { weeksSynced: targets.map((w) => w.weekNumber), games: count };
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const db = await getDb();
  const rows = await db.select().from(syncState).where(eq(syncState.key, SYNC_KEY));
  return rows[0]?.lastSyncedAt ?? null;
}

const g = globalThis as unknown as { __nflSyncInFlight?: Promise<RefreshResult>; __nflSyncFailedAt?: number };

export interface RefreshResult {
  ran: boolean;
  lastSyncedAt: Date | null;
  error?: string;
  /** refreshWithBudget gave up waiting; the sync may still finish in the background. */
  timedOut?: boolean;
}

/**
 * Refresh-on-view / "Refresh" button: runs syncScores only if the last sync is older than 5 minutes.
 * Concurrent callers in the same process share one in-flight promise. ESPN failures never throw
 * (the page still renders with stale data); they come back as `error`.
 */
export function maybeRefresh(now: Date, client?: EspnClient): Promise<RefreshResult> {
  if (g.__nflSyncInFlight) return g.__nflSyncInFlight;
  const p = (async (): Promise<RefreshResult> => {
    const last = await getLastSyncedAt();
    if (last && now.getTime() - last.getTime() < REFRESH_WINDOW_MS) return { ran: false, lastSyncedAt: last };
    const failedAt = g.__nflSyncFailedAt;
    if (failedAt !== undefined && now.getTime() >= failedAt && now.getTime() - failedAt < FAILURE_BACKOFF_MS) {
      return { ran: false, lastSyncedAt: last };
    }
    try {
      await syncScores({ client: client ?? getEspnClient(), now });
      g.__nflSyncFailedAt = undefined;
      return { ran: true, lastSyncedAt: await getLastSyncedAt() };
    } catch (e) {
      g.__nflSyncFailedAt = now.getTime();
      return { ran: false, lastSyncedAt: last, error: e instanceof Error ? e.message : String(e) };
    }
  })().finally(() => {
    g.__nflSyncInFlight = undefined;
  });
  g.__nflSyncInFlight = p;
  return p;
}

export const REFRESH_BUDGET_MS = 2500;

/**
 * maybeRefresh for page renders: waits at most `ms` for the sync. If it is slower the page renders with
 * the data it has (`timedOut: true`); the sync keeps running in the background or is abandoned harmlessly.
 */
export async function refreshWithBudget(now: Date, ms: number = REFRESH_BUDGET_MS, client?: EspnClient): Promise<RefreshResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RefreshResult>((resolve) => {
    timer = setTimeout(() => resolve({ ran: false, lastSyncedAt: null, timedOut: true }), ms);
  });
  try {
    return await Promise.race([maybeRefresh(now, client), timeout]);
  } catch (e) {
    return { ran: false, lastSyncedAt: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- admin overrides ----------

export async function adminOverrideGame(
  gameId: number,
  { homeScore, awayScore, winner }: { homeScore: number; awayScore: number; winner?: 'home' | 'away' | 'tie' },
): Promise<void> {
  if (![homeScore, awayScore].every((n) => Number.isInteger(n) && n >= 0)) {
    throw new Error('scores must be non-negative integers');
  }
  const derived = homeScore === awayScore ? 'tie' : homeScore > awayScore ? 'home' : 'away';
  const db = await getDb();
  const res = await db
    .update(games)
    .set({ homeScore, awayScore, winner: winner ?? derived, status: 'final', manualOverride: true })
    .where(eq(games.id, gameId))
    .returning({ id: games.id });
  if (res.length === 0) throw new Error(`game ${gameId} not found`);
}

/** Drops the manual override and clears the result; the next sync restores ESPN's data. */
export async function clearOverride(gameId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(games)
    .set({ manualOverride: false, homeScore: null, awayScore: null, winner: null, status: 'scheduled' })
    .where(eq(games.id, gameId));
}

/**
 * Voids a game (e.g. cancelled): it counts for nobody, is excluded from the games total, and a sync
 * won't revive it (manual_override). "Clear override" restores it to scheduled.
 */
export async function voidGame(gameId: number): Promise<void> {
  const db = await getDb();
  const res = await db
    .update(games)
    .set({ status: 'void', manualOverride: true, homeScore: null, awayScore: null, winner: null })
    .where(eq(games.id, gameId))
    .returning({ id: games.id });
  if (res.length === 0) throw new Error(`game ${gameId} not found`);
}
