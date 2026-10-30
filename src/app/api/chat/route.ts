import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listAfter, listBefore, listRecent } from '@/lib/chat';
import { now } from '@/lib/time';
import { isId } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** "123" -> 123; anything else (garbage, "1.5", "-1", "1e3", out of int4 range) -> null. `after` may be 0. */
function parseCursor(v: string | null, allowZero: boolean): number | null {
  if (v === null || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return isId(n) || (allowZero && n === 0) ? n : null;
}

/**
 * GET /api/chat: the latest page `{ messages, hasMore }`; `?after=<id>` -> `{ messages }` (new since that id,
 * polling); `?before=<id>` -> `{ messages, hasMore }` ("Load older"). Messages are oldest-first. 401 when
 * logged out, 400 on a malformed id or both params.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const params = new URL(req.url).searchParams;
  const after = params.get('after');
  const before = params.get('before');
  if (after !== null && before !== null) return json({ error: 'bad_request' }, 400);
  const t = await now();
  if (after !== null) {
    const id = parseCursor(after, true);
    if (id === null) return json({ error: 'bad_request' }, 400);
    return json({ messages: await listAfter(id, t) });
  }
  if (before !== null) {
    const id = parseCursor(before, false);
    if (id === null) return json({ error: 'bad_request' }, 400);
    return json(await listBefore(id, t));
  }
  return json(await listRecent(t));
}
