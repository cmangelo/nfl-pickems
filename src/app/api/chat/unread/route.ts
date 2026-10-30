import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { unreadCount } from '@/lib/chat';
import { now } from '@/lib/time';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** GET /api/chat/unread -> `{ count }` (badge polling). 401 when logged out. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json({ count: await unreadCount(user.id, await now()) }, { headers: NO_STORE });
}
