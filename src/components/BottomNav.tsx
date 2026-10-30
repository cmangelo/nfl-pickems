'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ListChecks, MessagesSquare, ShieldCheck, Trophy, Tv, type LucideIcon } from 'lucide-react';
import { UNREAD_POLL_MS, unreadBadgeLabel } from '@/lib/chat-view';

const isChatPath = (pathname: string) => pathname === '/chat' || pathname.startsWith('/chat/');

/**
 * Unread chat count for the Chat tab: starts from the server's count, then polls `/api/chat/unread` every
 * UNREAD_POLL_MS while the browser tab is visible (and at once on becoming visible or on navigating). On /chat
 * the room marks everything read, so the badge is hidden there and nothing is polled.
 */
function useUnreadCount(initial: number, pathname: string): number {
  const [count, setCount] = useState(initial);
  const onChat = isChatPath(pathname);

  useEffect(() => setCount(initial), [initial]);

  useEffect(() => {
    if (onChat) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/chat/unread', { cache: 'no-store' });
        if (!res.ok) return;
        const { count: n } = (await res.json()) as { count?: unknown };
        if (!cancelled && typeof n === 'number') setCount(n);
      } catch {
        // Offline: keep the last count; the next poll tries again.
      }
    };
    void load();
    const id = window.setInterval(load, UNREAD_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onChat, pathname]);

  return onChat ? 0 : count;
}

/**
 * Floating, iOS-style tab bar: a translucent capsule hovering above the bottom edge (clear of the home
 * indicator via safe-area-inset-bottom). The (app) layout pads <main> so content can scroll out from under it.
 */
export default function BottomNav({ isAdmin, unread }: { isAdmin: boolean; unread: number }) {
  const pathname = usePathname();
  const week = useSearchParams().get('week');
  const withWeek = (href: string) => (week ? `${href}?week=${encodeURIComponent(week)}` : href);
  const badge = unreadBadgeLabel(useUnreadCount(unread, pathname));
  const tabs: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: '/picks', label: 'My Picks', Icon: ListChecks },
    { href: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
    { href: '/games', label: 'Games', Icon: Tv },
    { href: '/chat', label: 'Chat', Icon: MessagesSquare },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', Icon: ShieldCheck }] : []),
  ];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Main"
        data-testid="bottom-nav"
        className="pointer-events-auto mx-auto grid h-[62px] max-w-md gap-0 rounded-full border border-white/10 bg-surface/70 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const on = pathname === href || pathname.startsWith(href + '/');
          const chatBadge = href === '/chat' ? badge : null;
          return (
            <Link
              key={href}
              href={withWeek(href)}
              aria-current={on ? 'page' : undefined}
              aria-label={chatBadge ? `${label}, ${chatBadge} unread` : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold tracking-tight whitespace-nowrap transition-colors ${
                on ? 'text-accent-bright' : 'text-muted hover:text-fg'
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
                {chatBadge && (
                  <span
                    data-testid="chat-badge"
                    aria-hidden="true"
                    className="absolute -top-1.5 left-[calc(100%-9px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-bold text-on-accent ring-2 ring-surface"
                  >
                    {chatBadge}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
