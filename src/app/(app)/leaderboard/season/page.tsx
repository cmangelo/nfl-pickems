import Link from 'next/link';
import { Banknote, CalendarCheck, Percent, Target, Trophy, type LucideIcon } from 'lucide-react';
import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { joinNames } from '@/lib/leaderboard-view';
import { seasonLeaders, weeksCountedLabel, type SeasonLeader } from '@/lib/season';
import { getSelectedWeek } from '@/lib/selected-week';
import { loadSeasonStats } from '@/lib/week-data';
import LeaderboardTabs from '../LeaderboardTabs';
import { AwardCard } from '../WeeklyReport';
import SeasonTable from './SeasonTable';

const LEADER_STYLE: Record<SeasonLeader['id'], { icon: LucideIcon; tone: string }> = {
  wins: { icon: Trophy, tone: 'var(--accent-bright)' },
  pct: { icon: Percent, tone: 'var(--correct)' },
  best: { icon: CalendarCheck, tone: '#60a5fa' },
  tb: { icon: Target, tone: '#c084fc' },
  net: { icon: Banknote, tone: 'var(--correct)' },
};

export default async function SeasonPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;
  const sel = await getSelectedWeek(weekParam);
  const { week } = sel;
  if (!week)
    return (
      <div className="flex flex-col gap-4">
        <LeaderboardTabs active="season" weekId={null} />
        <h1 className="sr-only">Season stats</h1>
        <NoWeeks />
      </div>
    );

  const stats = await loadSeasonStats(week.season, sel.now);
  const leaders = seasonLeaders(stats);
  // Another season to switch to: its most recent visible week (visibleWeeks is newest first).
  const latest = new Map<number, number>();
  for (const v of sel.visibleWeeks) if (!latest.has(v.week.season)) latest.set(v.week.season, v.week.id);
  const seasons = [...latest.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="flex flex-col gap-4">
      <LeaderboardTabs active="season" weekId={week.id} />
      <header>
        <h1 data-testid="season-title" className="text-2xl font-black">
          {week.season} Season
        </h1>
        <p data-testid="season-through" className="text-sm text-muted">
          {stats.weekNumbers.length > 0 ? `${weeksCountedLabel(stats.weekNumbers)} · completed weeks, paid entries` : 'No completed weeks yet'}
        </p>
      </header>
      {seasons.length > 1 && (
        <nav aria-label="Season" className="flex gap-2">
          {seasons.map(([season, weekId]) => (
            <Link
              key={season}
              href={`/leaderboard/season?week=${weekId}`}
              aria-current={season === week.season ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${season === week.season ? 'border-accent text-accent-bright' : 'border-border text-muted'}`}
            >
              {season}
            </Link>
          ))}
        </nav>
      )}

      {stats.rows.length === 0 ? (
        <p data-testid="season-empty" className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
          Season stats show up here once a week is final.
        </p>
      ) : (
        <>
          {leaders.length > 0 && (
            <section aria-label="Season leaders" className="grid grid-cols-2 gap-2">
              {leaders.map((l) => (
                <AwardCard key={l.id} testId={`leader-${l.id}`} icon={LEADER_STYLE[l.id].icon} tone={LEADER_STYLE[l.id].tone} label={l.title} names={joinNames(l.names)} value={l.value} />
              ))}
            </section>
          )}
          <SeasonTable rows={stats.rows} viewerId={user.id} hasMoney={stats.hasMoney} />
          <dl data-testid="season-legend" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
            <dt className="font-semibold">Pct</dt>
            <dd>Correct picks over graded games (a tied game counts as a miss; void games don&apos;t count).</dd>
            <dt className="font-semibold">Wins</dt>
            <dd>Weeks finished 1st, shared 1sts included.</dd>
            {stats.hasMoney && (
              <>
                <dt className="font-semibold">Net</dt>
                <dd>Pot winnings minus entry fees.</dd>
              </>
            )}
            <dt className="font-semibold">Picks</dt>
            <dd>Right-wrong over the season.</dd>
            <dt className="font-semibold">Best wk</dt>
            <dd>Highest percent correct in a single week.</dd>
            <dt className="font-semibold">TB ±</dt>
            <dd>Average distance of the tiebreaker guess from the actual total.</dd>
            <dt className="font-semibold">Top 3 · Wks</dt>
            <dd>Weeks finished in the top 3 · weeks played.</dd>
          </dl>
          <p className="text-xs text-muted">Tap a column to sort. Players with several entries in a week have every entry counted.</p>
        </>
      )}
    </div>
  );
}
