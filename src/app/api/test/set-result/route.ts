import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games } from '@/db/schema';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/**
 * Body: { gameId, winner: 'home'|'away'|'tie'|null, homeScore?, awayScore?, status?: 'postponed'|'void' }.
 * winner=null reverts to scheduled; `status` (with winner=null) marks the game postponed or void instead.
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as {
    gameId: number; winner: 'home' | 'away' | 'tie' | null; homeScore?: number; awayScore?: number; status?: 'postponed' | 'void';
  };
  const db = await getDb();
  if (b.winner === null) {
    await db.update(games).set({ status: b.status ?? 'scheduled', winner: null, homeScore: null, awayScore: null }).where(eq(games.id, b.gameId));
  } else {
    const homeScore = b.homeScore ?? (b.winner === 'home' ? 27 : b.winner === 'away' ? 17 : 20);
    const awayScore = b.awayScore ?? (b.winner === 'home' ? 17 : b.winner === 'away' ? 27 : 20);
    await db.update(games).set({ status: 'final', winner: b.winner, homeScore, awayScore }).where(eq(games.id, b.gameId));
  }
  return NextResponse.json({ ok: true });
}
