import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, syncState } from '@/db/schema';
import { getEspnClient, type EspnClient } from './espn';
import { upsertScoreboardGames } from './schedule';
import { getCurrentWeek, getPreviousWeek, weekState, type WeekRow } from './weeks';

export const SYNC_KEY = 'scores';
export const REFRESH_WINDOW_MS = 5 * 60 * 1000;
/** Minimum gap between attempts in this process after a failed sync (avoid hammering ESPN on every view). */
const FAILURE_BACKOFF_MS = 60 * 1000;

async function weekIsFinal(week: WeekRow, now: Date): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ status: games.status }).from(games).where(eq(games.weekId, week.id));
  return weekState(week, rows, now) === 'final';
}

/**
 * Pulls the scoreboard for the current week and the previous week (unless that one is already final;
 * `force` re-syncs it anyway) and updates kickoff times, final scores and winners. Games with
 * manual_override keep their scores/winner. Records sync_state 'scores'.
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
    if (prev && prev.season === current.season && (force || !(await weekIsFinal(prev, now)))) targets.push(prev);
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
