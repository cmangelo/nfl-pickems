import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games } from '@/db/schema';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/**
 * Body: { gameId, homeScore, awayScore, period, clock?, status? (default STATUS_IN_PROGRESS) } puts a game in
 * ESPN's in-progress display state; { gameId, live: null } clears it. Never touches the scored result.
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as {
    gameId: number; live?: null; homeScore?: number; awayScore?: number; period?: number; clock?: string; status?: string;
  };
  const db = await getDb();
  const set =
    b.live === null
      ? { liveHomeScore: null, liveAwayScore: null, livePeriod: null, liveClock: null, liveStatus: null }
      : {
          liveHomeScore: b.homeScore ?? 0,
          liveAwayScore: b.awayScore ?? 0,
          livePeriod: b.period ?? 1,
          liveClock: b.clock ?? null,
          liveStatus: b.status ?? 'STATUS_IN_PROGRESS',
        };
  await db.update(games).set(set).where(eq(games.id, b.gameId));
  return NextResponse.json({ ok: true });
}
