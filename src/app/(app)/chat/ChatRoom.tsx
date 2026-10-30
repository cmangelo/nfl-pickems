'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, SendHorizontal } from 'lucide-react';
import {
  CHAT_COUNTER_AT,
  CHAT_POLL_MS,
  chatErrorMessage,
  chatRemaining,
  chatTimeLabel,
  groupChatByDay,
  mergeChatMessages,
  validateChatBody,
  type ChatMessage,
} from '@/lib/chat-view';
import { markReadAction, sendMessageAction } from './actions';

/** Within this many px of the bottom counts as "at the bottom" (auto-scroll on new messages). */
const NEAR_BOTTOM_PX = 80;
/** The composer grows with its text up to this height, then scrolls. */
const INPUT_MAX_PX = 120;

type PendingScroll = 'bottom' | { height: number; top: number } | null;

const lastIdOf = (ms: ChatMessage[]) => (ms.length ? ms[ms.length - 1].id : 0);

const isNearBottom = (el: HTMLElement | null) => !el || el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;

/**
 * The league chat room: day-grouped bubbles in a scroll area that fills the page above the floating tab bar,
 * and a composer pinned under it. Polls `/api/chat?after=<lastId>` every CHAT_POLL_MS while the tab is visible.
 */
export default function ChatRoom({
  initialMessages,
  initialHasMore,
  viewerId,
}: {
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  viewerId: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pill, setPill] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  /** Polling cursor: the newest id seen through the initial page or a poll (not a sent message, so a poll never skips others' messages posted just before it). */
  const cursorRef = useRef(lastIdOf(initialMessages));
  const pendingScroll = useRef<PendingScroll>('bottom');
  /** The view is at (or near) the bottom: keep it there when the content or the area resizes. */
  const stickRef = useRef(true);
  const inFlight = useRef(false);
  const again = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Apply the scroll a render asked for: to the bottom, or keep the visible messages in place after prepending.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const p = pendingScroll.current;
    pendingScroll.current = null;
    if (!el || !p) return;
    if (p === 'bottom') {
      el.scrollTop = el.scrollHeight;
      stickRef.current = true;
    } else {
      el.scrollTop = p.top + (el.scrollHeight - p.height);
    }
  }, [messages]);

  // The area shrinks when the composer grows (or the viewport changes): stay at the bottom if we were there.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchNew = useCallback(async () => {
    if (inFlight.current) {
      again.current = true; // run once more when the current poll finishes (it may predate a send)
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const res = await fetch(`/api/chat?after=${cursorRef.current}`, { cache: 'no-store' });
        if (!res.ok || !mounted.current) return;
        const { messages: incoming } = (await res.json()) as { messages: ChatMessage[] };
        if (!mounted.current || incoming.length === 0) continue;
        cursorRef.current = Math.max(cursorRef.current, lastIdOf(incoming));
        const known = new Set(messagesRef.current.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) continue;
        if (isNearBottom(scrollRef.current)) pendingScroll.current = 'bottom';
        else setPill(true);
        setMessages((prev) => mergeChatMessages(prev, incoming));
        if (fresh.some((m) => m.userId !== viewerId) && document.visibilityState === 'visible') {
          markReadAction(cursorRef.current).catch(() => {});
        }
      } while (again.current && mounted.current);
    } catch {
      // Offline or a deploy in progress: the next poll tries again.
    } finally {
      inFlight.current = false;
    }
  }, [viewerId]);

  // Poll while the browser tab is visible; fetch at once when it becomes visible again.
  useEffect(() => {
    mounted.current = true;
    const visible = () => document.visibilityState === 'visible';
    const id = window.setInterval(() => {
      if (visible()) void fetchNew();
    }, CHAT_POLL_MS);
    const onVisibility = () => {
      if (visible()) void fetchNew();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchNew]);

  // Grow the composer with its text.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_PX)}px`;
  }, [text]);

  const onScroll = () => {
    stickRef.current = isNearBottom(scrollRef.current);
    if (stickRef.current) setPill(false);
  };

  const loadOlder = async () => {
    const first = messagesRef.current[0];
    if (loadingOlder || !first) return;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const res = await fetch(`/api/chat?before=${first.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { messages: ChatMessage[]; hasMore: boolean };
      const el = scrollRef.current;
      if (el) pendingScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => mergeChatMessages(prev, page.messages));
      setHasMore(page.hasMore);
    } catch {
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const check = validateChatBody(text);
  const remaining = chatRemaining(text);
  const canSend = check.ok && !sending;

  const send = async () => {
    if (sending) return;
    if (!check.ok) {
      if (check.error === 'too_long') setError(chatErrorMessage('too_long'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await sendMessageAction(text);
      if (res.ok) {
        setText('');
        setPill(false);
        pendingScroll.current = 'bottom';
        setMessages((prev) => mergeChatMessages(prev, [res.message]));
        void fetchNew();
      } else {
        setError(chatErrorMessage(res.error));
      }
    } catch {
      setError(chatErrorMessage('invalid'));
    } finally {
      setSending(false);
    }
  };

  const groups = groupChatByDay(messages);

  return (
    <div
      className="flex min-h-[260px] flex-col"
      // Fills the viewport between the header (60px) + main's top padding (16px) and main's bottom padding
      // (96px, which clears the floating tab bar), so only the message list scrolls.
      style={{ height: 'calc(100dvh - 172px - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
      data-testid="chat-room"
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-label="Messages"
          data-testid="chat-scroll"
          className="h-full overflow-y-auto overscroll-contain pb-2"
        >
          {hasMore && (
            <div className="flex flex-col items-center gap-1 py-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                data-testid="chat-load-older"
                className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60"
              >
                {loadingOlder ? 'Loading…' : 'Load older'}
              </button>
              {olderError && <span className="text-xs text-wrong">Couldn&apos;t load older messages.</span>}
            </div>
          )}
          {messages.length === 0 ? (
            <p data-testid="chat-empty" className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
              No messages yet. Start the trash talk.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <div className="flex justify-center pb-1 pt-3">
                  <span data-testid="chat-day" className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                    {g.label}
                  </span>
                </div>
                <ol>
                  {g.messages.map((m, i) => {
                    const own = m.userId === viewerId;
                    const firstOfRun = i === 0 || g.messages[i - 1].userId !== m.userId;
                    return (
                      <li
                        key={m.id}
                        data-testid="chat-message"
                        data-id={m.id}
                        data-own={own ? 'true' : 'false'}
                        data-username={m.username}
                        className={`flex flex-col ${own ? 'items-end' : 'items-start'} ${firstOfRun ? 'mt-2.5' : 'mt-1'}`}
                      >
                        {own ? (
                          <span className="sr-only">You:</span>
                        ) : (
                          <span
                            data-testid="chat-username"
                            className={firstOfRun ? 'mb-0.5 px-3 text-xs font-semibold text-muted' : 'sr-only'}
                          >
                            {m.username}
                          </span>
                        )}
                        <div
                          data-testid="chat-body"
                          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                            own ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md bg-surface-2 text-fg'
                          }`}
                        >
                          {m.body}
                        </div>
                        <time dateTime={m.createdAt} data-testid="chat-time" className="mt-0.5 px-1.5 text-[11px] text-muted">
                          {chatTimeLabel(m.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}
        </div>
        {pill && (
          <button
            type="button"
            data-testid="chat-new-pill"
            onClick={() => {
              setPill(false);
              stickRef.current = true;
              scrollToBottom(true);
            }}
            className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent shadow-[0_4px_14px_rgba(0,0,0,0.45)]"
          >
            <ArrowDown size={14} strokeWidth={2.5} aria-hidden="true" />
            New messages
          </button>
        )}
      </div>

      {error && (
        <p role="alert" data-testid="chat-error" className="px-1 pt-1.5 text-xs font-semibold text-wrong">
          {error}
        </p>
      )}
      <form
        className="mt-2 flex items-end gap-1.5 rounded-[24px] border border-border bg-surface py-1.5 pl-3.5 pr-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          aria-label="Message"
          placeholder="Message"
          data-testid="chat-input"
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-fg outline-none placeholder:text-muted"
        />
        {remaining <= CHAT_COUNTER_AT && (
          <span
            data-testid="chat-counter"
            aria-label={`${remaining} characters left`}
            className={`shrink-0 self-center text-xs font-semibold tabular-nums ${remaining < 0 ? 'text-wrong' : 'text-muted'}`}
          >
            {remaining}
          </span>
        )}
        <button
          type="submit"
          aria-label="Send"
          data-testid="chat-send"
          disabled={!canSend}
          // Keep focus (and the phone keyboard) in the textarea when tapping Send.
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:bg-surface-2 disabled:text-muted"
        >
          <SendHorizontal size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
