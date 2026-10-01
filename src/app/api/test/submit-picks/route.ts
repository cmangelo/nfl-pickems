import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, users } from '@/db/schema';
import { submitPicks } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { testGuard } from '@/lib/test-guard';
import { now } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Body: { username, weekId, picks, tiebreaker }. `picks` is either a { [gameId]: side } map or an
 * array of sides in game kickoff order. Uses submitPicks with asAdmin, so it works for locked weeks too.
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as { username: string; weekId: number; picks: Side[] | Record<number, Side>; tiebreaker: number };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${b.username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  let map: Record<number, Side>;
  if (Array.isArray(b.picks)) {
    const g = await db.select({ id: games.id, kickoffAt: games.kickoffAt }).from(games).where(eq(games.weekId, b.weekId));
    g.sort((x, y) => x.kickoffAt.getTime() - y.kickoffAt.getTime() || x.id - y.id);
    map = Object.fromEntries(g.map((x, i) => [x.id, b.picks[i] as Side]));
  } else map = b.picks;
  const res = await submitPicks(user.id, b.weekId, { picks: map, tiebreaker: b.tiebreaker }, { now: await now(), asAdmin: true });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
