import { requireUser } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import BottomNav from '@/components/BottomNav';
import { LogoBaseProvider } from '@/components/TeamLogo';
import { ESPN_LOGO_BASE } from '@/lib/game-view';
import { loadVisibleWeeks } from '@/lib/selected-week';
import { isTestMode, now } from '@/lib/time';
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
      {/* Bottom padding clears the floating tab bar (62px + its 12px/safe-area offset). */}
      <main className="flex-1 px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <LogoBaseProvider base={isTestMode() ? '/api/test/logo' : ESPN_LOGO_BASE}>{children}</LogoBaseProvider>
      </main>
      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
