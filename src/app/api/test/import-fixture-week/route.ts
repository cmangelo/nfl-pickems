import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { games, weeks } from '@/db/schema';
import { getEspnClient } from '@/lib/espn';
import { importSeason } from '@/lib/schedule';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** POST ?week=5&season=2026: imports exactly that week from the ESPN fixture. Returns { weekId, gameIds } (kickoff order). */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const week = Number(url.searchParams.get('week'));
  const season = Number(url.searchParams.get('season') ?? 2026);
  if (!Number.isInteger(week) || week < 1) return NextResponse.json({ error: 'week required' }, { status: 400 });
  const base = getEspnClient();
  // importSeason imports fromWeek..18; restrict to the single requested week.
  const client = { getScoreboard: (p: { season: number; week: number }) => (p.week === week ? base.getScoreboard(p) : Promise.resolve([])) };
  const result = await importSeason({ season, fromWeek: week, client });
  const db = await getDb();
  const [w] = await db.select().from(weeks).where(and(eq(weeks.season, season), eq(weeks.weekNumber, week)));
  if (!w) return NextResponse.json({ error: 'no fixture for that week', result }, { status: 404 });
  const g = await db.select({ id: games.id, kickoffAt: games.kickoffAt }).from(games).where(eq(games.weekId, w.id));
  g.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime() || a.id - b.id);
  return NextResponse.json({ weekId: w.id, gameIds: g.map((x) => x.id), result });
}
