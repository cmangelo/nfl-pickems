import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { chatMessages } from '@/db/schema';
import { freshDb, makeUser } from '@/lib/testing/helpers';
import { GET } from './route';
import { GET as GET_UNREAD } from './unread/route';

process.env.DB_DRIVER = 'memory';

const auth = vi.hoisted(() => ({ user: null as { id: number } | null }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => auth.user }));
vi.mock('@/lib/time', async (orig) => ({
  ...(await orig<typeof import('@/lib/time')>()),
  now: async () => new Date('2026-10-25T20:00:00Z'),
}));

const get = (qs = '') => GET(new Request(`http://x/api/chat${qs}`));

describe('chat route handlers', () => {
  let ids: number[];
  let annId: number;
  beforeAll(async () => {
    await getDb();
  }, 60_000);
  beforeEach(async () => {
    await freshDb();
    const ann = await makeUser('Ann');
    const bob = await makeUser('Bob');
    annId = ann.id;
    auth.user = null;
    const db = await getDb();
    const rows = await db
      .insert(chatMessages)
      .values([
        { userId: bob.id, body: 'too old', createdAt: new Date('2026-09-01T00:00:00Z') },
        ...Array.from({ length: 55 }, (_, i) => ({ userId: bob.id, body: `b${i + 1}`, createdAt: new Date(Date.UTC(2026, 9, 25, 12, 0, i)) })),
      ])
      .returning({ id: chatMessages.id });
    ids = rows.map((r) => r.id).sort((a, b) => a - b);
  });

  it('401 (no-store) when logged out', async () => {
    for (const res of [await get(), await get('?after=1'), await GET_UNREAD()]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('400 on malformed ids or both cursors', async () => {
    auth.user = { id: annId };
    for (const qs of ['?after=abc', '?after=-1', '?after=1.5', '?after=1e3', '?after=', '?after=99999999999', '?before=0', '?before=x', '?before=2147483648', '?after=1&before=5', '?from=1', '?before=5&from=1', '?after=1&from=0', '?after=1&from=x', '?after=1&from=-1', '?after=1&from=', '?after=1&from=2147483648', '?after=x&from=1']) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('latest page, before and after (window applied)', async () => {
    auth.user = { id: annId };
    const latest = await get();
    expect(latest.status).toBe(200);
    expect(latest.headers.get('cache-control')).toBe('no-store');
    const page = (await latest.json()) as { messages: { id: number; body: string; username: string; createdAt: string }[]; hasMore: boolean };
    expect(page.hasMore).toBe(true);
    expect(page.messages).toHaveLength(50);
    expect(page.messages[49]).toMatchObject({ body: 'b55', username: 'bob', createdAt: '2026-10-25T12:00:54.000Z' });

    const older = await (await get(`?before=${page.messages[0].id}`)).json();
    // The 30-day-old message is outside the window: only b1..b5 remain and nothing more.
    expect(older.messages.map((m: { body: string }) => m.body)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(older.hasMore).toBe(false);

    const after = await (await get(`?after=${ids[53]}`)).json();
    expect(after).toEqual({ messages: [expect.objectContaining({ body: 'b54' }), expect.objectContaining({ body: 'b55' })] });
    expect((await (await get('?after=0')).json()).messages).toHaveLength(55);
  });

  it('?after=&from= adds the deleted ids at or above `from`; without `from` there is no deletedIds', async () => {
    auth.user = { id: annId };
    const db = await getDb();
    const tombstone = { body: null, deletedAt: new Date('2026-10-25T19:00:00Z') };
    for (const i of [2, 10, 54]) await db.update(chatMessages).set(tombstone).where(eq(chatMessages.id, ids[i]));
    const polled = await (await get(`?after=${ids[52]}&from=${ids[5]}`)).json();
    expect(polled.messages.map((m: { body: string }) => m.body)).toEqual(['b53', 'b55']); // b54 is deleted
    expect([...polled.deletedIds].sort((a: number, b: number) => a - b)).toEqual([ids[10], ids[54]]);
    expect(await (await get(`?after=${ids[52]}`)).json()).toEqual({
      messages: [expect.objectContaining({ body: 'b53' }), expect.objectContaining({ body: 'b55' })],
    });
    expect((await (await get(`?after=0&from=1`)).json()).deletedIds).toHaveLength(3);
    // The latest page skips them too.
    expect((await (await get()).json()).messages.map((m: { body: string }) => m.body)).not.toContain('b54');
  });

  it('unread count for the current user', async () => {
    auth.user = { id: annId };
    const res = await GET_UNREAD();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ count: 55 });
  });
});
