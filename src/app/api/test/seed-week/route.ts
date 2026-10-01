import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { games, weeks } from '@/db/schema';
import { testGuard } from '@/lib/test-guard';
import { now, weekLockAt, weekTuesday, weekUnlockAt } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Result = 'home' | 'away' | 'tie' | null;

const TEAMS = ['KC', 'BUF', 'PHI', 'DAL', 'SF', 'SEA', 'DET', 'GB', 'BAL', 'CIN', 'MIA', 'NYJ', 'HOU', 'IND', 'JAX', 'TEN',
  'MIN', 'CHI', 'ATL', 'TB', 'LAR', 'ARI', 'LAC', 'DEN', 'WSH', 'NYG', 'PIT', 'CLE', 'NE', 'NO', 'CAR', 'LV'];

/**
 * Body: { season?, weekNumber?, numGames?, results?, tuesday?, lockAt? }
 *  - numGames (default 16, max 16): games are kicked off Thu night, Sun, then the LAST game is Monday night.
 *  - results: optional array (per game, in kickoff order) of 'home'|'away'|'tie'|null; non-null => final.
 *  - tuesday: ISO instant inside the desired week (default: the current week per now()).
 *  - lockAt: ISO override for the lock time.
 * Returns { weekId, gameIds } (gameIds in kickoff order).
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as {
    season?: number; weekNumber?: number; numGames?: number; results?: Result[]; tuesday?: string; lockAt?: string;
  };
  const numGames = Math.min(Math.max(body.numGames ?? 16, 1), 16);
  const ref = body.tuesday ? new Date(body.tuesday) : await now();
  const tue = weekTuesday(ref);
  const unlockAt = weekUnlockAt(tue);
  const lockAt = body.lockAt ? new Date(body.lockAt) : weekLockAt(tue);

  const db = await getDb();
  const [week] = await db
    .insert(weeks)
    .values({ season: body.season ?? 2026, weekNumber: body.weekNumber ?? 5, unlockAt, lockAt })
    .returning();

  const hour = 3600 * 1000;
  const thursdayNight = new Date(lockAt.getTime() + 8.25 * hour);
  const rows = Array.from({ length: numGames }, (_, i) => {
    const kickoffAt =
      i === 0 ? thursdayNight
      : i === numGames - 1 && numGames > 1 ? new Date(lockAt.getTime() + 4.2 * 24 * hour)
      : new Date(lockAt.getTime() + (3 + Math.floor(i / 6) * 0.1) * 24 * hour + (i % 6) * 0.01 * hour);
    const result = body.results?.[i] ?? null;
    const homeScore = result === null ? null : result === 'home' ? 27 : result === 'away' ? 17 : 20;
    const awayScore = result === null ? null : result === 'home' ? 17 : result === 'away' ? 27 : 20;
    return {
      weekId: week.id,
      espnId: `test-${week.id}-${i}`,
      kickoffAt,
      homeTeam: TEAMS[(i * 2) % TEAMS.length],
      awayTeam: TEAMS[(i * 2 + 1) % TEAMS.length],
      homeScore,
      awayScore,
      status: (result === null ? 'scheduled' : 'final') as 'scheduled' | 'final',
      winner: result,
    };
  }).sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());

  const inserted = await db.insert(games).values(rows).returning({ id: games.id, kickoffAt: games.kickoffAt });
  inserted.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  return NextResponse.json({ weekId: week.id, gameIds: inserted.map((g) => g.id) });
}
