import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { refreshWithBudget } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock, resolveTiebreakerGame } from '@/lib/weeks';
import { selectEntry } from '@/lib/entry-select';
import { entryLabel } from '@/lib/week-view';
import EntryTabs from '../../../picks/EntryTabs';
import LockedPicks from '../../../picks/LockedPicks';

export default async function PlayerPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string | string[]; entry?: string | string[] }>;
}) {
  const viewer = await requireUser();
  const { userId } = await params;
  const sp = await searchParams;
  const weekParam = sp.week;
  if (!/^\d+$/.test(userId)) notFound();
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await refreshWithBudget(t);
    sel = await getSelectedWeek(weekParam, t);
  }
  const { week, games, state } = sel;
  if (!week || !state) return <NoWeeks />;
  const back = `/leaderboard?week=${week.id}`;
  // Picks are hidden until the lock.
  if (state === 'open') redirect(back);

  const theirs = (await listEntries(week.id)).filter((e) => e.userId === Number(userId));
  const { entry, index } = selectEntry(theirs, sp.entry, undefined, { allowNew: false });
  const base = `/leaderboard/player/${userId}?week=${week.id}`;
  const tabs = theirs.map((e, i) => ({ key: String(i + 1), label: `Entry ${i + 1}`, href: `${base}&entry=${e.entryId}`, current: e === entry }));
  const tb = await resolveTiebreakerGame(week, games, t);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const name = entry?.username ?? 'Player';
  const mine = entry?.userId === viewer.id;

  return (
    <div className="flex flex-col gap-3">
      <Link href={back} data-testid="back-to-leaderboard" className="inline-flex items-center gap-0.5 self-start text-sm text-accent-bright">
        <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
        Leaderboard
      </Link>
      <h1 data-testid="player-heading" className="text-2xl font-bold">
        {mine ? 'Your picks' : `${name}'s picks`}
        <span className="ml-2 text-sm font-normal text-muted">
          Week {week.weekNumber}
          {theirs.length > 1 && ` · Entry ${index + 1}`}
        </span>
      </h1>
      <EntryTabs tabs={tabs} />
      {entry && !entry.paid && (
        <p data-testid="player-unpaid" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          Not counted · unpaid. This entry is left out of the standings until an admin marks it paid.
        </p>
      )}
      <LockedPicks
        games={games}
        entry={entry}
        weekNumber={week.weekNumber}
        userName={entry ? entryLabel(entry.username, entry.entryIndex, entry.entryCount) : name}
        tiebreakerLabel={tbLabel}
        lockShort={formatPT(effectiveLock(week), "EEE h:mm a 'PT'")}
        now={t}
        other={!mine}
      />
    </div>
  );
}
