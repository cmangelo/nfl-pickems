import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import AvatarMenu from '@/components/AvatarMenu';
import BottomNav from '@/components/BottomNav';

export const dynamic = 'force-dynamic';

// TODO(week phase): derive the selected week from the week picker / current week.
const PLACEHOLDER_WEEK = 1;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border pl-1.5 pr-3">
        <Link
          href="/weeks"
          aria-label={`Week ${PLACEHOLDER_WEEK}, change week`}
          data-testid="week-picker"
          className="flex h-11 items-center gap-0.5 rounded-[10px] px-2 text-[28px] font-bold hover:bg-surface-2"
        >
          Week {PLACEHOLDER_WEEK}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Link>
        {/* status pill slot (Open / Live / Final) */}
        <span data-testid="status-pill" />
        <AvatarMenu initial={user.firstName.trim().charAt(0).toUpperCase()} />
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
