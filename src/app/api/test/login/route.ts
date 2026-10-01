import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, users } from '@/db/schema';
import { testGuard } from '@/lib/test-guard';
import { now } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** Body: { username }. Creates a sessions row and sets the `session` cookie (no PIN check; auth is not built yet). */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const { username } = (await req.json()) as { username: string };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date((await now()).getTime() + 365 * 24 * 3600 * 1000);
  await db.insert(sessions).values({ id: token, userId: user.id, expiresAt });
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set('session', token, { httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt });
  return res;
}
