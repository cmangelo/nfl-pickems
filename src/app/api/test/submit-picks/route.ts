import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, games, users } from '@/db/schema';
import { submitPicks } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { testGuard } from '@/lib/test-guard';
import { now } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Body: { username, weekId, picks, tiebreaker, entry? }. `picks` is either a { [gameId]: side } map or an
 * array of sides in game kickoff order. `entry`: omitted = the user's first entry, 'new' = add an entry,
 * a number = that entry_no. Uses submitPicks with asAdmin, so it works for locked weeks too.
 * Returns { ok, entryId }.
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as {
    username: string;
    weekId: number;
    picks: Side[] | Record<number, Side>;
    tiebreaker: number;
    entry?: 'new' | number;
  };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${b.username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  let map: Record<number, Side>;
  if (Array.isArray(b.picks)) {
    const g = await db.select({ id: games.id, kickoffAt: games.kickoffAt }).from(games).where(eq(games.weekId, b.weekId));
    g.sort((x, y) => x.kickoffAt.getTime() - y.kickoffAt.getTime() || x.id - y.id);
    map = Object.fromEntries(g.map((x, i) => [x.id, b.picks[i] as Side]));
  } else map = b.picks;
  let target: { entryId?: number; newEntry?: boolean } = {};
  if (b.entry === 'new') target = { newEntry: true };
  else if (typeof b.entry === 'number') {
    const [e] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.userId, user.id), eq(entries.weekId, b.weekId), eq(entries.entryNo, b.entry)));
    if (!e) return NextResponse.json({ error: 'no such entry' }, { status: 404 });
    target = { entryId: e.id };
  }
  const res = await submitPicks(user.id, b.weekId, { picks: map, tiebreaker: b.tiebreaker }, { now: await now(), asAdmin: true, ...target });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
