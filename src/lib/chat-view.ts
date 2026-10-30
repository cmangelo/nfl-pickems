import { formatInTimeZone } from 'date-fns-tz';

/**
 * Client-safe chat constants, wire type and pure helpers (no server/DB imports, no clock reads).
 * Server logic lives in chat.ts.
 */

const PT = 'America/Los_Angeles';

/** Messages older than this (relative to now()) are never returned and are pruned nightly. */
export const CHAT_RETENTION_DAYS = 30;
/** Max message length in characters (Unicode code points, same as Postgres char_length). */
export const CHAT_MAX_LENGTH = 500;
/** Messages per page (initial render and each "Load older"). */
export const CHAT_PAGE_SIZE = 50;
/** At most this many messages per user per CHAT_RATE_WINDOW_MS. */
export const CHAT_RATE_LIMIT = 10;
export const CHAT_RATE_WINDOW_MS = 60_000;
/** Poll for new messages on /chat. */
export const CHAT_POLL_MS = 4000;
/** Poll the unread count everywhere else (badge). */
export const UNREAD_POLL_MS = 30_000;
/** The composer shows the remaining count once at most this many characters are left. */
export const CHAT_COUNTER_AT = 50;

export interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  body: string;
  /** ISO instant. */
  createdAt: string;
}

export type ChatPostError = 'empty' | 'too_long' | 'rate_limited';
/** `not_found`: unknown, already deleted or aged out. `forbidden`: someone else's message (non-admin). */
export type ChatDeleteError = 'not_found' | 'forbidden';

/** Trims, normalizes line endings and drops NUL characters (Postgres text can't hold them). */
export function normalizeChatBody(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').split('\u0000').join('').trim();
}

/** Length in characters (code points), so an emoji such as "🏈" counts as 1, not 2 UTF-16 units. */
export function chatLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    // A high surrogate followed by a low surrogate is one code point.
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** Characters left for the composer, counting the text as it will be saved (trimmed). */
export function chatRemaining(raw: string): number {
  return CHAT_MAX_LENGTH - chatLength(normalizeChatBody(raw));
}

/** Normalizes and validates a message body: `{ ok, body }` or the reason it can't be sent. */
export function validateChatBody(raw: string): { ok: true; body: string } | { ok: false; error: 'empty' | 'too_long' } {
  const body = normalizeChatBody(raw);
  if (!body) return { ok: false, error: 'empty' };
  if (chatLength(body) > CHAT_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, body };
}

/** Copy for a failed send. */
export function chatErrorMessage(error: ChatPostError | 'invalid'): string {
  switch (error) {
    case 'empty':
      return 'Type a message first.';
    case 'too_long':
      return `Messages can be at most ${CHAT_MAX_LENGTH} characters.`;
    case 'rate_limited':
      return 'Slow down. Try again in a minute.';
    default:
      return "Couldn't send that message.";
  }
}

/** Copy for a failed delete. */
export const CHAT_DELETE_ERROR = "Couldn't delete that message.";

/** Players may delete their own messages; admins may delete any. */
export function canDeleteChatMessage(viewer: { id: number; isAdmin: boolean }, message: { userId: number }): boolean {
  return viewer.isAdmin || message.userId === viewer.id;
}

const toDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d);

/** PT calendar day of a message, yyyy-MM-dd (day separators). */
export function chatDayKey(createdAt: string | Date): string {
  return formatInTimeZone(toDate(createdAt), PT, 'yyyy-MM-dd');
}

/** Day separator label in PT: "Sun, Oct 25". Never "Today"/"Yesterday" (that needs the current time). */
export function chatDayLabel(createdAt: string | Date): string {
  return formatInTimeZone(toDate(createdAt), PT, 'EEE, MMM d');
}

/** Message time in PT: "1:05 PM". */
export function chatTimeLabel(createdAt: string | Date): string {
  return formatInTimeZone(toDate(createdAt), PT, 'h:mm a');
}

export interface ChatDayGroup<T> {
  /** PT calendar day, yyyy-MM-dd. */
  key: string;
  /** "Sun, Oct 25" */
  label: string;
  messages: T[];
}

/** Groups messages (already oldest-first) into consecutive PT days. */
export function groupChatByDay<T extends { createdAt: string }>(messages: T[]): ChatDayGroup<T>[] {
  const groups: ChatDayGroup<T>[] = [];
  for (const m of messages) {
    const key = chatDayKey(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.messages.push(m);
    else groups.push({ key, label: chatDayLabel(m.createdAt), messages: [m] });
  }
  return groups;
}

/** Merges fetched messages into a list by id (dedupes, keeps oldest-first). */
export function mergeChatMessages<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Drops messages whose id is in `ids`; returns `current` itself when none of them is there. */
export function removeChatMessages<T extends { id: number }>(current: T[], ids: Iterable<number>): T[] {
  const drop = new Set(ids);
  if (drop.size === 0 || !current.some((m) => drop.has(m.id))) return current;
  return current.filter((m) => !drop.has(m.id));
}

/** Unread badge text: null (hidden) at 0, "1".."9", then "9+". */
export function unreadBadgeLabel(count: number): string | null {
  if (!(count > 0)) return null;
  return count > 9 ? '9+' : String(Math.floor(count));
}
