'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ListChecks, ShieldCheck, Trophy, Tv, type LucideIcon } from 'lucide-react';

/**
 * Floating, iOS-style tab bar: a translucent capsule hovering above the bottom edge (clear of the home
 * indicator via safe-area-inset-bottom). The (app) layout pads <main> so content can scroll out from under it.
 */
export default function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const week = useSearchParams().get('week');
  const withWeek = (href: string) => (week ? `${href}?week=${encodeURIComponent(week)}` : href);
  const tabs: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: '/picks', label: 'My Picks', Icon: ListChecks },
    { href: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
    { href: '/games', label: 'Games', Icon: Tv },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', Icon: ShieldCheck }] : []),
  ];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Main"
        data-testid="bottom-nav"
        className="pointer-events-auto mx-auto grid h-[62px] max-w-md gap-1 rounded-full border border-white/10 bg-surface/70 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const on = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={withWeek(href)}
              aria-current={on ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                on ? 'text-accent-bright' : 'text-muted hover:text-fg'
              }`}
            >
              <TabBody Icon={Icon} label={label} on={on} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Lights the tapped tab up at once (an optimistic state) while its page loads, so a slow load never looks like a dead tap. */
function TabBody({ Icon, label, on }: { Icon: LucideIcon; label: string; on: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      data-pending={pending ? 'true' : undefined}
      className={`flex flex-col items-center gap-0.5 ${pending ? 'text-accent-bright' : ''}`}
    >
      <Icon size={22} strokeWidth={on || pending ? 2.4 : 2} aria-hidden="true" className={pending ? 'animate-pulse' : ''} />
      {label}
    </span>
  );
}
