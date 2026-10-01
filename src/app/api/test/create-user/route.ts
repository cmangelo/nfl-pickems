import { NextResponse } from 'next/server';
import { signUp } from '@/lib/auth';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Body: { firstName, username, pin? (default 1234) }. Creates a user without starting a session. */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as { firstName: string; username: string; pin?: string };
  const res = await signUp(b.firstName, b.username, b.pin ?? '1234');
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, userId: res.user.id });
}
