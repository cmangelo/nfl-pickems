import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/bearer';
import { getEspnClient } from '@/lib/espn';
import { findStartWeek, importSeason, seasonOf } from '@/lib/schedule';
import { syncScores } from '@/lib/sync';
import { now } from '@/lib/time';
import { getCurrentWeek } from '@/lib/weeks';

export const dynamic = 'force-dynamic';

/** Nightly job (vercel.json). Vercel sends `Authorization: Bearer ${CRON_SECRET}`. Fails closed if the secret is unset. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !bearerMatches(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const t = await now();
  const client = getEspnClient();

  // 1. Schedule refresh from the current week on (flexed kickoffs, Week 18 matchups; new season start).
  const current = await getCurrentWeek(t);
  const imports: { season: number; fromWeek: number; weeks: number; games: number }[] = [];
  const plans: { season: number; fromWeek: number }[] = [];
  if (current) plans.push({ season: current.season, fromWeek: current.weekNumber });
  const year = seasonOf(t);
  if (!current || year > current.season) {
    const start = await findStartWeek(client, year, t);
    if (start !== null) plans.push({ season: year, fromWeek: start });
  }
  for (const p of plans) imports.push({ ...p, ...(await importSeason({ ...p, client })) });

  // 2. Scores for the (possibly new) current week and the previous week.
  const sync = await syncScores({ client, now: t });
  return NextResponse.json({ ok: true, imports, sync });
}
