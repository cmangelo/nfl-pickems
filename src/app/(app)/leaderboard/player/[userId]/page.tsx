import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { listEntries } from '@/lib/picks';
import { tiebreakerGame } from '@/lib/scoring';
import { getSelectedWeek } from '@/lib/selected-week';
import { maybeRefresh } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock } from '@/lib/weeks';
import LockedPicks from '../../../picks/LockedPicks';

export default async function PlayerPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const viewer = await requireUser();
  const { userId } = await params;
  const { week: weekParam } = await searchParams;
  if (!/^\d+$/.test(userId)) notFound();
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await maybeRefresh(t);
    sel = await getSelectedWeek(weekParam, t);
  }
  const { week, games, state } = sel;
  if (!week || !state) return <NoWeeks />;
  const back = `/leaderboard?week=${week.id}`;
  // Picks are hidden until the lock.
  if (state === 'open') redirect(back);

  const entry = (await listEntries(week.id)).find((e) => e.userId === Number(userId)) ?? null;
  const tb = tiebreakerGame(games);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const name = entry?.firstName ?? 'Player';
  const mine = entry?.userId === viewer.id;

  return (
    <div className="flex flex-col gap-3">
      <Link href={back} data-testid="back-to-leaderboard" className="text-sm text-accent-bright">
        ← Leaderboard
      </Link>
      <h1 data-testid="player-heading" className="text-2xl font-bold">
        {mine ? 'Your picks' : `${name}'s picks`}
        <span className="ml-2 text-sm font-normal text-muted">Week {week.weekNumber}</span>
      </h1>
      {entry && !entry.paid && (
        <p data-testid="player-unpaid" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          Not counted · unpaid. This entry is left out of the standings until an admin marks it paid.
        </p>
      )}
      <LockedPicks
        games={games}
        entry={entry}
        weekNumber={week.weekNumber}
        userName={name}
        tiebreakerLabel={tbLabel}
        lockShort={formatPT(effectiveLock(week), "EEE h:mm a 'PT'")}
        other={!mine}
      />
    </div>
  );
}
