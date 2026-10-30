'use server';

import { requireUser } from '@/lib/auth';
import { deleteMessage, markRead, postMessage, type DeleteMessageResult, type PostMessageResult } from '@/lib/chat';
import { now } from '@/lib/time';
import { isId } from '@/lib/validate';

export type SendMessageResult = PostMessageResult | { ok: false; error: 'invalid' };
export type MarkReadResult = { ok: true; lastReadId: number } | { ok: false; error: 'invalid' };
export type DeleteMessageActionResult = DeleteMessageResult | { ok: false; error: 'invalid' };

/** Posts a chat message as the current player. Error codes: empty | too_long | rate_limited | invalid. */
export async function sendMessageAction(body: unknown): Promise<SendMessageResult> {
  const user = await requireUser();
  if (typeof body !== 'string') return { ok: false, error: 'invalid' };
  return postMessage(user.id, body, await now());
}

/** Marks every message up to `upToId` read for the current player (never backwards). */
export async function markReadAction(upToId: unknown): Promise<MarkReadResult> {
  const user = await requireUser();
  if (!isId(upToId)) return { ok: false, error: 'invalid' };
  return { ok: true, lastReadId: await markRead(user.id, upToId) };
}

/** Deletes a chat message: the current player's own, or any message for an admin. Error codes: not_found | forbidden | invalid. */
export async function deleteMessageAction(messageId: unknown): Promise<DeleteMessageActionResult> {
  const user = await requireUser();
  if (!isId(messageId)) return { ok: false, error: 'invalid' };
  return deleteMessage({ id: user.id, isAdmin: user.isAdmin }, messageId, await now());
}
