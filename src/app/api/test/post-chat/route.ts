import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { chatMessages, users } from '@/db/schema';
import { now } from '@/lib/time';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/**
 * Body: { username, body, at?, count? }. Inserts chat messages as that user, bypassing the rate limit.
 * `at` = ISO created_at (default now()). `count` = N messages "body 1".."body N", 1 s apart starting at `at`.
 * Returns { ids } (ascending).
 */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as { username: string; body: string; at?: string; count?: number };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${b.username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  const start = b.at ? new Date(b.at) : await now();
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'bad at' }, { status: 400 });
  const values =
    b.count === undefined
      ? [{ userId: user.id, body: b.body, createdAt: start }]
      : Array.from({ length: b.count }, (_, i) => ({
          userId: user.id,
          body: `${b.body} ${i + 1}`,
          createdAt: new Date(start.getTime() + i * 1000),
        }));
  if (values.length === 0) return NextResponse.json({ ids: [] });
  const rows = await db.insert(chatMessages).values(values).returning({ id: chatMessages.id });
  return NextResponse.json({ ids: rows.map((r) => r.id).sort((x, y) => x - y) });
}
