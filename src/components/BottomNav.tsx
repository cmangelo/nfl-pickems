'use client';

import Link from 'next/link';
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
                on ? 'bg-white/10 text-accent-bright' : 'text-muted hover:text-fg'
              }`}
            >
              <Icon size={22} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
