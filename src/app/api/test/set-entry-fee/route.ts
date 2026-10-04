import { NextResponse } from 'next/server';
import { setEntryFee } from '@/lib/admin';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Body: { weekId, cents } (cents null = clear). Sets that week's own entry fee. */
export async function POST(req: Request) {
  const blocked = testGuard();
  if (blocked) return blocked;
  const b = (await req.json()) as { weekId: number; cents: number | null };
  if (!(await setEntryFee(b.weekId, b.cents))) return NextResponse.json({ error: 'bad week or amount' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
