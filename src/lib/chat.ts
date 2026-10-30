import { and, asc, desc, eq, gt, gte, lt, ne, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { chatMessages, users } from '@/db/schema';
import {
  CHAT_PAGE_SIZE,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  CHAT_RETENTION_DAYS,
  validateChatBody,
  type ChatMessage,
  type ChatPostError,
} from './chat-view';

export * from './chat-view';

/** Most messages one `listAfter` poll returns; the next poll (after the last id) picks up the rest. */
export const CHAT_AFTER_CAP = 200;

export type PostMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: ChatPostError };

export interface ChatPage {
  /** Oldest-first. */
  messages: ChatMessage[];
  /** More (older) messages exist within the retention window. */
  hasMore: boolean;
}

/** Oldest instant still inside the retention window at `at`. Older messages are never read. */
export function chatCutoff(at: Date): Date {
  return new Date(at.getTime() - CHAT_RETENTION_DAYS * 86_400_000);
}

async function selectMessages(where: SQL | undefined, order: 'asc' | 'desc', limit: number): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      username: users.username,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(where)
    .orderBy(order === 'asc' ? asc(chatMessages.id) : desc(chatMessages.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Newest-first rows (limit + 1 fetched) -> an oldest-first page. */
function toPage(rows: ChatMessage[], limit: number): ChatPage {
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

/**
 * Posts a message at `at` (from now()). Trimmed; empty or > CHAT_MAX_LENGTH characters is refused, and so is
 * the (CHAT_RATE_LIMIT + 1)th message within CHAT_RATE_WINDOW_MS. The rate check and the insert are one
 * statement (atomic on every driver).
 */
export async function postMessage(userId: number, rawBody: string, at: Date): Promise<PostMessageResult> {
  const v = validateChatBody(rawBody);
  if (!v.ok) return v;
  const db = await getDb();
  const since = new Date(at.getTime() - CHAT_RATE_WINDOW_MS);
  const res = await db.execute(sql`
    INSERT INTO chat_messages (user_id, body, created_at)
    SELECT ${userId}::integer, ${v.body}::text, ${at.toISOString()}::timestamptz
    WHERE (
      SELECT count(*) FROM chat_messages
      WHERE user_id = ${userId}::integer AND created_at > ${since.toISOString()}::timestamptz
    ) < ${CHAT_RATE_LIMIT}::integer
    RETURNING id`);
  const id = Number((res as unknown as { rows: { id: number }[] }).rows[0]?.id);
  if (!id) return { ok: false, error: 'rate_limited' };
  const [message] = await selectMessages(eq(chatMessages.id, id), 'asc', 1);
  return { ok: true, message };
}

/** The newest `limit` messages within the window, oldest-first. */
export async function listRecent(at: Date, limit = CHAT_PAGE_SIZE): Promise<ChatPage> {
  const rows = await selectMessages(gte(chatMessages.createdAt, chatCutoff(at)), 'desc', limit + 1);
  return toPage(rows, limit);
}

/** The `limit` messages just older than `beforeId` within the window, oldest-first ("Load older"). */
export async function listBefore(beforeId: number, at: Date, limit = CHAT_PAGE_SIZE): Promise<ChatPage> {
  const where = and(lt(chatMessages.id, beforeId), gte(chatMessages.createdAt, chatCutoff(at)));
  return toPage(await selectMessages(where, 'desc', limit + 1), limit);
}

/** Every message with id > afterId within the window, oldest-first (at most CHAT_AFTER_CAP; polling). */
export async function listAfter(afterId: number, at: Date): Promise<ChatMessage[]> {
  const where = and(gt(chatMessages.id, afterId), gte(chatMessages.createdAt, chatCutoff(at)));
  return selectMessages(where, 'asc', CHAT_AFTER_CAP);
}

/** Messages from other players newer than the user's last-read message, within the window. */
export async function unreadCount(userId: number, at: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(
      and(
        ne(chatMessages.userId, userId),
        gte(chatMessages.createdAt, chatCutoff(at)),
        sql`${chatMessages.id} > (SELECT ${users.chatLastReadId} FROM ${users} WHERE ${users.id} = ${userId})`,
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Marks messages up to `upToId` read. Never moves the marker backwards and never past the newest real
 * message id (a forged huge id can't hide future messages). Returns the marker (0 for an unknown user).
 */
export async function markRead(userId: number, upToId: number): Promise<number> {
  const db = await getDb();
  const rows = await db
    .update(users)
    .set({
      chatLastReadId: sql`GREATEST(${users.chatLastReadId}, LEAST(${upToId}::integer, COALESCE((SELECT max(id) FROM chat_messages), 0)))`,
    })
    .where(eq(users.id, userId))
    .returning({ lastReadId: users.chatLastReadId });
  return rows[0]?.lastReadId ?? 0;
}

/** Deletes messages older than the retention window at `at` (nightly cron). Returns how many were deleted. */
export async function pruneChat(at: Date): Promise<number> {
  const db = await getDb();
  const rows = await db.delete(chatMessages).where(lt(chatMessages.createdAt, chatCutoff(at))).returning({ id: chatMessages.id });
  return rows.length;
}
