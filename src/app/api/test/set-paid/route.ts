import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { entries, users } from '@/db/schema';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Body: { username, weekId, paid }. Sets the paid flag on that user's entry. */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as { username: string; weekId: number; paid: boolean };
  const db = await getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${b.username})`);
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  const rows = await db
    .update(entries)
    .set({ paid: b.paid })
    .where(and(eq(entries.userId, user.id), eq(entries.weekId, b.weekId)))
    .returning({ id: entries.id });
  if (rows.length === 0) return NextResponse.json({ error: 'no entry' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
