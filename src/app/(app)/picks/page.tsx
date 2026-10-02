import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { getEntry } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT, now as getNow } from '@/lib/time';
import { refreshWithBudget } from '@/lib/sync';
import { effectiveLock, resolveTiebreakerGame } from '@/lib/weeks';
import { groupGamesByPtDay } from '@/lib/week-view';
import Countdown from './Countdown';
import LockedPicks from './LockedPicks';
import PicksForm from './PicksForm';

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await refreshWithBudget(t); // refresh-on-view: throttled, time-boxed, never throws
    sel = await getSelectedWeek(weekParam, t);
  }
  const { week, games, state } = sel;
  if (!week || !state)
    return (
      <>
        <h1 className="mb-3 text-2xl font-bold">My Picks</h1>
        <NoWeeks />
      </>
    );

  const lock = effectiveLock(week);
  const tb = await resolveTiebreakerGame(week, games, t);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const entry = await getEntry(user.id, week.id);

  let body: React.ReactNode;
  if (state === 'open') {
    if (games.length === 0) return <NoWeeks />;
    const days = groupGamesByPtDay(games).map((d) => ({
      key: d.key,
      label: d.label,
      games: d.games.map((g) => ({ id: g.id, away: g.awayTeam, home: g.homeTeam, time: formatPT(g.kickoffAt, "h:mm a 'PT'") })),
    }));
    body = (
      <>
        <div className="mb-4 rounded-xl border border-border bg-surface p-3">
          <div data-testid="lock-info" className="font-semibold">Locks {formatPT(lock, "EEE, MMM d · h:mm a 'PT'")}</div>
          <Countdown lockAt={lock.toISOString()} serverNow={t.toISOString()} />
        </div>
        <PicksForm
          key={week.id}
          weekId={week.id}
          days={days}
          initialPicks={entry?.picks ?? {}}
          initialTiebreaker={entry?.tiebreaker ?? null}
          tiebreakerLabel={tbLabel}
          lockShort={formatPT(lock, "EEE h:mm a 'PT'")}
          hasEntry={!!entry}
        />
      </>
    );
  } else {
    body = (
      <LockedPicks
        games={games}
        entry={entry}
        weekNumber={week.weekNumber}
        userName={user.firstName}
        tiebreakerLabel={tbLabel}
        lockShort={formatPT(lock, "EEE h:mm a 'PT'")}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">My Picks</h1>
      {body}
    </div>
  );
}
