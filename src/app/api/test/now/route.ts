import { NextResponse } from 'next/server';
import { now } from '@/lib/time';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const blocked = testGuard();
  if (blocked) return blocked;
  return NextResponse.json({ now: (await now()).toISOString() });
}
