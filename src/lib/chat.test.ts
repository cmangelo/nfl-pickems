import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { chatMessages, users } from '@/db/schema';
import {
  CHAT_AFTER_CAP,
  chatCutoff,
  listAfter,
  listBefore,
  listRecent,
  markRead,
  postMessage,
  pruneChat,
  unreadCount,
} from './chat';
import { freshDb, makeUser } from './testing/helpers';

process.env.DB_DRIVER = 'memory';

const T = new Date('2026-10-25T20:00:00Z');
const plus = (ms: number) => new Date(T.getTime() + ms);
const DAY = 86_400_000;

/** Inserts `n` messages by `userId`, 1 s apart from `start`, bypassing validation and the rate limit. */
async function seed(userId: number, n: number, start = T, prefix = 'm') {
  const db = await getDb();
  const rows = await db
    .insert(chatMessages)
    .values(Array.from({ length: n }, (_, i) => ({ userId, body: `${prefix}${i + 1}`, createdAt: new Date(start.getTime() + i * 1000) })))
    .returning({ id: chatMessages.id });
  return rows.map((r) => r.id).sort((a, b) => a - b);
}

describe('chat', () => {
  let ann: { id: number };
  let bob: { id: number };
  beforeEach(async () => {
    await freshDb();
    ann = await makeUser('Ann');
    bob = await makeUser('Bob');
  });

  describe('postMessage', () => {
    it('stores the trimmed body at `at` and returns the wire message', async () => {
      const res = await postMessage(ann.id, '  go bills \r\n ', T);
      expect(res).toEqual({
        ok: true,
        message: { id: expect.any(Number), userId: ann.id, username: 'ann', body: 'go bills', createdAt: T.toISOString() },
      });
    });

    it('rejects empty, whitespace-only and too-long bodies without storing anything', async () => {
      expect(await postMessage(ann.id, '', T)).toEqual({ ok: false, error: 'empty' });
      expect(await postMessage(ann.id, ' \n\t ', T)).toEqual({ ok: false, error: 'empty' });
      expect(await postMessage(ann.id, 'a'.repeat(501), T)).toEqual({ ok: false, error: 'too_long' });
      expect(await postMessage(ann.id, '🏈'.repeat(501), T)).toEqual({ ok: false, error: 'too_long' });
      const db = await getDb();
      expect(await db.select().from(chatMessages)).toHaveLength(0);
    });

    it('accepts exactly 500 characters, emoji counted as one (matches the DB CHECK)', async () => {
      expect((await postMessage(ann.id, 'a'.repeat(500), T)).ok).toBe(true);
      const res = await postMessage(ann.id, '🏈'.repeat(500), plus(1));
      expect(res.ok && res.message.body).toBe('🏈'.repeat(500));
    });

    it('the DB refuses an empty or 501-character body on its own', async () => {
      const db = await getDb();
      await expect(db.insert(chatMessages).values({ userId: ann.id, body: '', createdAt: T })).rejects.toThrow();
      await expect(db.insert(chatMessages).values({ userId: ann.id, body: 'a'.repeat(501), createdAt: T })).rejects.toThrow();
    });

    it('rate limit: 10 per 60 s per user, the 11th is refused, ok again after 60 s', async () => {
      for (let i = 0; i < 10; i++) expect((await postMessage(ann.id, `m${i}`, plus(i * 1000))).ok, `msg ${i}`).toBe(true);
      expect(await postMessage(ann.id, 'eleventh', plus(10_000))).toEqual({ ok: false, error: 'rate_limited' });
      // Other players are not affected.
      expect((await postMessage(bob.id, 'hi', plus(10_000))).ok).toBe(true);
      // Still limited just before the first message leaves the window...
      expect(await postMessage(ann.id, 'still', plus(59_999))).toEqual({ ok: false, error: 'rate_limited' });
      // ...and allowed once it is 60 s old.
      expect((await postMessage(ann.id, 'back', plus(60_000))).ok).toBe(true);
      const db = await getDb();
      expect(await db.select().from(chatMessages).where(eq(chatMessages.userId, ann.id))).toHaveLength(11);
    });
  });

  describe('reads', () => {
    it('listRecent returns the newest page oldest-first with hasMore', async () => {
      const ids = await seed(ann.id, 55);
      const at = plus(DAY);
      const page = await listRecent(at);
      expect(page.messages.map((m) => m.id)).toEqual(ids.slice(5));
      expect(page.hasMore).toBe(true);
      expect(page.messages[0]).toMatchObject({ userId: ann.id, username: 'ann', body: 'm6' });
      expect(await listRecent(at, 55)).toMatchObject({ hasMore: false });
      expect((await listRecent(at, 55)).messages).toHaveLength(55);
      expect(await listRecent(at, 100)).toMatchObject({ hasMore: false });
    });

    it('listRecent on an empty room', async () => {
      expect(await listRecent(T)).toEqual({ messages: [], hasMore: false });
    });

    it('listBefore pages back until nothing is left', async () => {
      const ids = await seed(ann.id, 120);
      const at = plus(DAY);
      const p1 = await listRecent(at);
      expect(p1.messages.map((m) => m.id)).toEqual(ids.slice(70));
      const p2 = await listBefore(p1.messages[0].id, at);
      expect(p2.messages.map((m) => m.id)).toEqual(ids.slice(20, 70));
      expect(p2.hasMore).toBe(true);
      const p3 = await listBefore(p2.messages[0].id, at);
      expect(p3.messages.map((m) => m.id)).toEqual(ids.slice(0, 20));
      expect(p3.hasMore).toBe(false);
      expect(await listBefore(ids[0], at)).toEqual({ messages: [], hasMore: false });
      // Exactly one page left: hasMore false.
      expect(await listBefore(ids[50], at)).toMatchObject({ hasMore: false });
      expect((await listBefore(ids[50], at)).messages).toHaveLength(50);
    });

    it('listAfter returns everything newer, oldest-first, capped', async () => {
      const ids = await seed(ann.id, 5);
      const at = plus(DAY);
      expect((await listAfter(ids[1], at)).map((m) => m.id)).toEqual(ids.slice(2));
      expect(await listAfter(ids[4], at)).toEqual([]);
      expect((await listAfter(0, at)).map((m) => m.id)).toEqual(ids);
      const more = await seed(bob.id, CHAT_AFTER_CAP + 5, plus(10_000));
      const capped = await listAfter(ids[4], at);
      expect(capped).toHaveLength(CHAT_AFTER_CAP);
      expect(capped[0].id).toBe(more[0]);
    });

    it('every read and the unread count ignore messages older than 30 days', async () => {
      const at = T;
      const cutoff = chatCutoff(at);
      expect(cutoff.toISOString()).toBe('2026-09-25T20:00:00.000Z');
      const [old] = await seed(bob.id, 1, new Date(cutoff.getTime() - 1), 'old');
      const [edge] = await seed(bob.id, 1, cutoff, 'edge');
      const [fresh] = await seed(bob.id, 1, plus(-DAY), 'fresh');
      expect((await listRecent(at)).messages.map((m) => m.id)).toEqual([edge, fresh]);
      expect((await listRecent(at)).hasMore).toBe(false);
      expect(await listBefore(edge, at)).toEqual({ messages: [], hasMore: false });
      expect((await listBefore(fresh, at)).messages.map((m) => m.id)).toEqual([edge]);
      expect((await listAfter(0, at)).map((m) => m.id)).toEqual([edge, fresh]);
      expect(old).toBeLessThan(edge);
      expect(await unreadCount(ann.id, at)).toBe(2);
      // A day later "edge" has aged out too.
      expect((await listRecent(plus(DAY))).messages.map((m) => m.id)).toEqual([fresh]);
      expect(await unreadCount(ann.id, plus(DAY))).toBe(1);
      // hasMore never counts aged-out messages.
      expect(await listRecent(at, 1)).toMatchObject({ hasMore: true });
      expect(await listRecent(plus(DAY), 1)).toMatchObject({ hasMore: false });
    });
  });

  describe('unread and markRead', () => {
    it('unreadCount counts other players’ messages after the last-read id, never own ones', async () => {
      await seed(ann.id, 3, T, 'a');
      const bobIds = await seed(bob.id, 4, plus(10_000), 'b');
      expect(await unreadCount(ann.id, plus(60_000))).toBe(4);
      expect(await unreadCount(bob.id, plus(60_000))).toBe(3);
      await markRead(ann.id, bobIds[1]);
      expect(await unreadCount(ann.id, plus(60_000))).toBe(2);
      await markRead(ann.id, bobIds[3]);
      expect(await unreadCount(ann.id, plus(60_000))).toBe(0);
      // Own new message doesn't make anything unread.
      await postMessage(ann.id, 'mine', plus(70_000));
      expect(await unreadCount(ann.id, plus(70_000))).toBe(0);
      expect(await unreadCount(9999, plus(70_000))).toBe(0);
    });

    it('markRead never moves backwards and never past the newest message id', async () => {
      const db = await getDb();
      const lastRead = async () => (await db.select().from(users).where(eq(users.id, ann.id)))[0].chatLastReadId;
      expect(await lastRead()).toBe(0);
      expect(await markRead(ann.id, 5)).toBe(0); // no messages yet
      const ids = await seed(bob.id, 3);
      expect(await markRead(ann.id, ids[1])).toBe(ids[1]);
      expect(await markRead(ann.id, ids[0])).toBe(ids[1]);
      expect(await lastRead()).toBe(ids[1]);
      expect(await markRead(ann.id, 2_000_000_000)).toBe(ids[2]);
      expect(await lastRead()).toBe(ids[2]);
      // A message posted after a forged huge id is still unread.
      await seed(bob.id, 1, plus(5000));
      expect(await unreadCount(ann.id, plus(10_000))).toBe(1);
      expect(await markRead(9999, ids[2])).toBe(0);
    });
  });

  describe('pruneChat', () => {
    it('deletes only messages older than 30 days and returns the count', async () => {
      const cutoff = chatCutoff(T);
      await seed(ann.id, 2, new Date(cutoff.getTime() - 5000), 'old');
      await seed(ann.id, 1, cutoff, 'edge');
      await seed(bob.id, 2, plus(-1000), 'new');
      expect(await pruneChat(T)).toBe(2);
      const db = await getDb();
      expect((await db.select().from(chatMessages)).map((m) => m.body).sort()).toEqual(['edge1', 'new1', 'new2']);
      expect(await pruneChat(T)).toBe(0);
    });

    it('messages of a deactivated player stay; deleting the user cascades', async () => {
      await seed(ann.id, 2);
      const db = await getDb();
      await db.update(users).set({ deactivatedAt: T }).where(eq(users.id, ann.id));
      expect((await listRecent(plus(1000))).messages.map((m) => m.username)).toEqual(['ann', 'ann']);
      await db.delete(users).where(eq(users.id, ann.id));
      expect((await listRecent(plus(1000))).messages).toEqual([]);
    });
  });
});
