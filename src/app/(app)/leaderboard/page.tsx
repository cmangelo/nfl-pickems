import NoWeeks from '@/components/NoWeeks';
import RevealedCard from '@/components/RevealedCard';
import { requireUser } from '@/lib/auth';
import { formatUpdatedAgo, joinNames, upsetHeadline, upsetRightText, upsetWrongText, winnerBanner } from '@/lib/leaderboard-view';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { getLastSyncedAt, refreshWithBudget } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock, resolveTiebreakerGame } from '@/lib/weeks';
import { loadWeekSummary } from '@/lib/week-data';
import { NotCounted, RankedTable } from './RankedTable';
import RefreshButton from './RefreshButton';

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

  if (state === 'open') {
    const entries = await listEntries(week.id);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Leaderboard</h1>
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
        <RankedTable ranked={summary.ranked} weekId={week.id} viewerId={user.id} showDiff={tbFinal} />
        <p data-testid="tb-footnote" className="text-xs text-muted">
          Players with the same number correct share a rank. The tiebreaker (closest guess to the total points in {tbName})
          only applies once that game is final.
        </p>
        <NotCounted entries={summary.notCounted} weekId={week.id} />
      </div>
    );
  }

  // Final recap
  const banner = winnerBanner(week.weekNumber, summary.winners, summary.gamesTotal);
  const stats = summary.stats;
  const upset = summary.upset;
  const upsetGame = upset ? games.find((g) => g.id === upset.gameId) : undefined;
  const upsetHead = upsetGame ? upsetHeadline(upsetGame) : null;
  const upsetRight = upset ? upsetRightText(upset) : null;
  const tile = (id: string, label: string, value: string, sub?: string) => (
    <div data-testid={id} className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Leaderboard</h1>
      <p data-testid="final-status" className="text-sm text-muted">Final · {gamesText}</p>
      {banner ? (
        <div data-testid="winner-banner" className="rounded-xl border border-accent bg-accent/10 p-4 text-center">
          <div data-testid="winner-title" className="text-xs font-semibold uppercase tracking-wide text-accent-bright">{banner.title}</div>
          <div data-testid="winner-names" className="mt-1 text-3xl font-bold">{banner.names}</div>
          <div data-testid="winner-detail" className="mt-1 text-sm text-muted">{banner.detail}</div>
        </div>
      ) : (
        <p data-testid="no-winner" className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
          No counted entries this week, so there is no winner yet.
        </p>
      )}

      {stats && (
        <div data-testid="stats" className="grid grid-cols-2 gap-2">
          {tile('stat-average', 'Average', `${stats.average} correct`)}
          {tile('stat-entries', 'Entries counted', String(stats.countedEntries))}
          {tile('stat-most', 'Most', `${stats.mostCorrect.correct} correct`, joinNames(stats.mostCorrect.names))}
          {tile('stat-fewest', 'Fewest', `${stats.fewestCorrect.correct} correct`, joinNames(stats.fewestCorrect.names))}
        </div>
      )}

      {upset && upsetHead && (
        <div data-testid="upset" className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-accent-bright">Upset of the week</div>
          <div data-testid="upset-headline" className="mt-1 text-lg font-bold">{upsetHead}</div>
          <div data-testid="upset-wrong" className="text-sm text-muted">{upsetWrongText(upset)}</div>
          {upsetRight && <div data-testid="upset-right" className="text-sm text-muted">{upsetRight}</div>}
        </div>
      )}

      <RankedTable ranked={summary.ranked} weekId={week.id} viewerId={user.id} showDiff={tbFinal} />
      {tbFinal && (
        <p data-testid="mnf-total" className="text-xs text-muted">
          {tbName} finished with {summary.tiebreakerActualTotal} total points. The number in parentheses is each guess&apos;s distance from it.
        </p>
      )}
      <NotCounted entries={summary.notCounted} weekId={week.id} />
    </div>
  );
}
