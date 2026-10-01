import { requireUser } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import { loadVisibleWeeks } from '@/lib/selected-week';
import { now } from '@/lib/time';
import { getCurrentWeek } from '@/lib/weeks';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await now();
  const [visible, current] = await Promise.all([loadVisibleWeeks(t), getCurrentWeek(t)]);
  const weeks = visible.map((v) => ({ id: v.week.id, number: v.week.weekNumber, state: v.state }));
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <AppHeader weeks={weeks} currentId={current?.id ?? null} initial={user.firstName.trim().charAt(0).toUpperCase()} />
      <main className="flex-1 px-4 py-4">{children}</main>
      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
