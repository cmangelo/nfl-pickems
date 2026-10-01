import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Body: { username }. Creates a real session row and sets the `session` cookie (no PIN check). */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const { username } = (await req.json()) as { username: string };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
