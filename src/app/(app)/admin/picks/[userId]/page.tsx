import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import NoWeeks from '@/components/NoWeeks';
import { getEntry } from '@/lib/picks';
import { tiebreakerGame } from '@/lib/scoring';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
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
  const { userId: rawId } = await params;
  const { week: weekParam } = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();
  const userId = Number(rawId);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) notFound();
  const { week, games } = await getSelectedWeek(weekParam);
  if (!week || games.length === 0) return <NoWeeks />;

  const entry = await getEntry(userId, week.id);
  const tb = tiebreakerGame(games);
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
        <Link href={`/admin/payments?week=${week.id}`} className="text-sm font-semibold text-accent-bright">
          ← Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Edit picks: {user.firstName} <span className="text-base font-normal text-muted">@{user.username}</span>
        </h1>
        <p className="text-sm text-muted">
          Week {week.weekNumber}. {entry ? 'Changes replace their current picks.' : 'No picks yet; this creates their entry.'} Works after the lock too.
        </p>
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
