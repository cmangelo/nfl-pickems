'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import AvatarMenu from '@/components/AvatarMenu';
import WeekStatePill from '@/components/WeekStatePill';
import { resolveWeekId } from '@/lib/week-id';

export interface HeaderWeek {
  id: number;
  number: number;
  state: 'hidden' | 'open' | 'locked' | 'final';
}

export default function AppHeader({
  weeks,
  currentId,
  initial,
}: {
  weeks: HeaderWeek[];
  currentId: number | null;
  initial: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = resolveWeekId(params.get('week'), weeks.map((w) => w.id), currentId);
  const week = weeks.find((w) => w.id === id) ?? null;
  const from = pathname === '/weeks' ? (params.get('from') ?? '/picks') : pathname;
  const href = week ? `/weeks?week=${week.id}&from=${encodeURIComponent(from)}` : '/weeks';

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border pl-1.5 pr-3">
      <Link
        href={href}
        aria-label={week ? `Week ${week.number}, change week` : 'Choose week'}
        data-testid="week-picker"
        className="flex h-11 items-center gap-0.5 rounded-[10px] px-2 text-[28px] font-bold hover:bg-surface-2"
      >
        {week ? `Week ${week.number}` : 'Weeks'}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Link>
      {week && <WeekStatePill state={week.state} testId="status-pill" />}
      <AvatarMenu initial={initial} />
    </header>
  );
}
