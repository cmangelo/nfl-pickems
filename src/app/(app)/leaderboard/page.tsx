import NoWeeks from '@/components/NoWeeks';
import PotCard from '@/components/PotCard';
import RevealedCard from '@/components/RevealedCard';
import { requireUser } from '@/lib/auth';
import { formatUpdatedAgo } from '@/lib/leaderboard-view';
import { listEntries } from '@/lib/picks';
import { computePot } from '@/lib/pot';
import { weekReport } from '@/lib/report';
import { getSelectedWeek } from '@/lib/selected-week';
import { getLastSyncedAt, refreshWithBudget } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock, resolveTiebreakerGame } from '@/lib/weeks';
import { loadEntryFee, loadWeekSummary } from '@/lib/week-data';
import { NotCounted, RankedTable } from './RankedTable';
import RefreshButton from './RefreshButton';
import WeeklyReport from './WeeklyReport';

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
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
        <h1 className="mb-3 text-2xl font-bold">Leaderboard</h1>
        <NoWeeks />
      </>
    );

  const fee = await loadEntryFee(week);
  if (state === 'open') {
    const entries = await listEntries(week.id);
    const openPot = computePot(fee?.cents, entries.filter((e) => e.paid).length);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Leaderboard</h1>
        {openPot && <PotCard pot={openPot} open />}
        <RevealedCard
          lockShort={formatPT(effectiveLock(week), "EEE h:mm a 'PT'")}
          names={entries.filter((e) => e.entryIndex === 0).map((e) => ({ userId: e.userId, firstName: e.firstName, entries: e.entryCount }))}
          count={entries.length}
          viewerId={user.id}
        />
      </div>
    );
  }

  const summary = await loadWeekSummary(week, games, t);
  const tb = await resolveTiebreakerGame(week, games, t);
  const tbName = tb ? `${tb.awayTeam} @ ${tb.homeTeam}` : 'the tiebreaker game';
  const tbFinal = summary.tiebreakerActualTotal !== null;
  const gamesText = `${summary.gamesFinal} of ${summary.gamesTotal} games final`;
  const pot = computePot(fee?.cents, summary.ranked.length);

  if (state === 'locked') {
    const last = await getLastSyncedAt();
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Leaderboard</h1>
        <div className="flex items-start justify-between gap-3">
          <p data-testid="live-status" className="text-sm text-muted">
            {formatUpdatedAgo(last, t)} · {gamesText}
          </p>
          <RefreshButton />
        </div>
        {pot && <PotCard pot={pot} />}
        <RankedTable
          ranked={summary.ranked}
          games={games}
          weekId={week.id}
          viewerId={user.id}
          showDiff={tbFinal}
          live
          eliminated={summary.eliminated}
        />
        <p data-testid="tb-footnote" className="text-xs text-muted">
          Players with the same number correct share a rank. The tiebreaker (closest guess to the total points in {tbName})
          only applies once that game is final.
        </p>
        {summary.eliminated.length > 0 && (
          <p data-testid="out-footnote" className="text-xs text-muted">
            OUT: that entry can&apos;t finish 1st (or tie for it), even if every one of its remaining picks is right.
          </p>
        )}
        <NotCounted entries={summary.notCounted} weekId={week.id} />
      </div>
    );
  }

  // Final recap: the weekly report, then the full standings.
  const entries = await listEntries(week.id);
  const report = weekReport(
    games,
    entries.map((e) => ({ entryId: e.entryId, userId: e.userId, name: e.label, paid: e.paid, tiebreaker: e.tiebreaker, picks: e.picks })),
    summary,
  );
  return (
    <div className="flex flex-col gap-4">
      <WeeklyReport weekNumber={week.weekNumber} summary={summary} report={report} games={games} pot={pot} gamesText={gamesText} />
      <RankedTable ranked={summary.ranked} games={games} weekId={week.id} viewerId={user.id} showDiff={tbFinal} />
      {tbFinal && (
        <p data-testid="mnf-total" className="text-xs text-muted">
          {tbName} finished with {summary.tiebreakerActualTotal} total points. The number in parentheses is each guess&apos;s distance from it.
        </p>
      )}
      <NotCounted entries={summary.notCounted} weekId={week.id} />
    </div>
  );
}
