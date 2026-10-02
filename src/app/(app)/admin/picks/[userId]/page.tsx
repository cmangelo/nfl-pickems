import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { isId } from '@/lib/validate';
import NoWeeks from '@/components/NoWeeks';
import { getEntry } from '@/lib/picks';
import { requireAdmin } from '@/lib/auth';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
import { resolveTiebreakerGame } from '@/lib/weeks';
import { groupGamesByPtDay } from '@/lib/week-view';
import PicksForm from '../../../picks/PicksForm';
import { adminSubmitPicksAction } from '../../actions';

export default async function AdminEditPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const me = await requireAdmin();
  const { userId: rawId } = await params;
  const { week: weekParam } = await searchParams;
  if (!/^\d+$/.test(rawId) || !isId(Number(rawId))) notFound();
  const userId = Number(rawId);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.deactivatedAt) notFound();
  const { week, games, state, now } = await getSelectedWeek(weekParam);
  if (!week || games.length === 0) return <NoWeeks />;

  // While the week is open another player's picks stay hidden from the admin: blank form, replace-only.
  const hidden = state === 'open' && user.id !== me.id;
  const entry = hidden ? null : await getEntry(userId, week.id);
  const tb = await resolveTiebreakerGame(week, games, now);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const days = groupGamesByPtDay(games).map((d) => ({
    key: d.key,
    label: d.label,
    games: d.games.map((g) => ({ id: g.id, away: g.awayTeam, home: g.homeTeam, time: formatPT(g.kickoffAt, "h:mm a 'PT'") })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/admin/payments?week=${week.id}`} className="inline-flex items-center gap-0.5 text-sm font-semibold text-accent-bright">
          <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
          Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Edit picks: {user.firstName} <span className="text-base font-normal text-muted">@{user.username}</span>
        </h1>
        {hidden ? (
          <p data-testid="picks-hidden-notice" className="text-sm text-muted">
            Week {week.weekNumber}. Picks are hidden until the lock. Saving replaces this player&apos;s picks.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Week {week.weekNumber}. {entry ? 'Changes replace their current picks.' : 'No picks yet; this creates their entry.'} Works after the lock too.
          </p>
        )}
      </div>
      <PicksForm
        key={`${week.id}-${userId}`}
        weekId={week.id}
        days={days}
        initialPicks={entry?.picks ?? {}}
        initialTiebreaker={entry?.tiebreaker ?? null}
        tiebreakerLabel={tbLabel}
        lockShort=""
        hasEntry={!!entry}
        savedMessage={`Picks saved for ${user.firstName}.`}
        submitAction={adminSubmitPicksAction.bind(null, userId, week.id)}
      />
    </div>
  );
}
