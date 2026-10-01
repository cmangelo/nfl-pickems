'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICONS: Record<string, string> = {
  '/picks': 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
  '/leaderboard': 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  '/games': 'M3 5h18v14H3zM12 5v14M3 12h18',
  '/admin': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
};

export default function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: '/picks', label: 'My Picks' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/games', label: 'Games' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 grid h-16 shrink-0 border-t border-border bg-bg"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-[3px] text-xs font-semibold ${
              on ? 'text-accent-bright' : 'text-muted'
            }`}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[t.href]} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
