'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import AvatarMenu from '@/components/AvatarMenu';
import WeekStatePill from '@/components/WeekStatePill';
import { resolveWeekId, safeFrom } from '@/lib/week-id';

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
  const open = pathname === '/weeks';
  const from = open ? safeFrom(params.get('from')) : pathname;
  // Pages not tied to one week show a title instead of the week picker.
  const title = pathname === '/admin/players' ? 'Admin' : pathname === '/leaderboard/season' ? 'Leaderboard' : null;
  const hideWeek = title !== null;
  // The picker is a page: tapping the button while it is open closes it (back to where it was opened from).
  const href = open
    ? week ? `${from}?week=${week.id}` : from
    : week ? `/weeks?week=${week.id}&from=${encodeURIComponent(from)}` : '/weeks';

  return (
    <header className="flex h-[calc(60px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border pl-1.5 pr-3 pt-[env(safe-area-inset-top)]">
      {hideWeek ? (
        <span className="px-2 text-[28px] font-bold" data-testid={title === 'Admin' ? 'admin-title' : 'page-title'}>
          {title}
        </span>
      ) : (
        <Link
          href={href}
          aria-label={open ? 'Close week picker' : week ? `Week ${week.number}, change week` : 'Choose week'}
          aria-expanded={open}
          data-testid="week-picker"
          className={`flex h-11 items-center gap-0.5 rounded-[10px] px-2 text-[28px] font-bold hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
        >
          {week ? `Week ${week.number}` : 'Weeks'}
          <ChevronDown size={20} strokeWidth={2.25} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </Link>
      )}
      {week && !hideWeek && <WeekStatePill state={week.state} testId="status-pill" />}
      <AvatarMenu initial={initial} />
    </header>
  );
}
