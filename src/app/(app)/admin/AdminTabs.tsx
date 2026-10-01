'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/players', label: 'Players' },
];

export default function AdminTabs() {
  const pathname = usePathname();
  const week = useSearchParams().get('week');
  return (
    <nav aria-label="Admin" className="grid grid-cols-3 rounded-[10px] bg-surface-2 p-[3px]">
      {TABS.map((t) => {
        const on = pathname === t.href || (t.href === '/admin/games' && pathname.startsWith('/admin/picks'));
        return (
          <Link
            key={t.href}
            href={week && t.href !== '/admin/players' ? `${t.href}?week=${encodeURIComponent(week)}` : t.href}
            aria-current={on ? 'page' : undefined}
            className={`flex h-[38px] items-center justify-center rounded-lg text-[15px] font-semibold ${
              on ? 'bg-border text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
