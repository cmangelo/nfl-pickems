import Link from 'next/link';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { notFound } from 'next/navigation';
import Avatar from '@/components/Avatar';
import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/pot';
import { netLabel, pct0, pct1, tbAvgLabel, weeksCountedLabel } from '@/lib/season';
import { getSelectedWeek } from '@/lib/selected-week';
import { now as getNow } from '@/lib/time';
import { isId } from '@/lib/validate';
import { loadPlayerSeason } from '@/lib/week-data';
import { rankLabel } from '@/lib/week-view';

function Tile({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/** One player's season: their season-table numbers as tiles, then every completed week they played. */
export default async function PlayerSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const viewer = await requireUser();
  const { userId: raw } = await params;
  const { week: weekParam } = await searchParams;
  const userId = Number(raw);
  if (!/^\d+$/.test(raw) || !isId(userId)) notFound();
  const t = await getNow();
  const { week } = await getSelectedWeek(weekParam, t);
  if (!week) return <NoWeeks />;
  const p = await loadPlayerSeason(week.season, userId, t);
  if (p.username === null) notFound();
  const mine = userId === viewer.id;
  const r = p.row;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/leaderboard/season?week=${week.id}`}
        data-testid="back-to-season"
        className="inline-flex items-center gap-0.5 self-start text-sm text-accent-bright"
      >
        <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
        Season
      </Link>
      <header className="flex items-center gap-3">
        <Avatar userId={userId} name={p.username} size={48} />
        <div className="min-w-0">
          <h1 data-testid="player-season-heading" className="truncate text-2xl font-black">
            {mine ? 'Your season' : p.username}
          </h1>
          <p className="text-sm text-muted">
            {week.season} Season{p.weekNumbers.length > 0 && ` · ${weeksCountedLabel(p.weekNumbers)}`}
          </p>
        </div>
      </header>

      {!r ? (
        <p data-testid="player-season-empty" className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
          No completed weeks with a paid entry yet.
        </p>
      ) : (
        <>
          <section aria-label="Season totals" className="grid grid-cols-3 gap-2">
            <Tile testId="tile-pct" label="Pct" value={r.pct === null ? '–' : pct1(r.pct)} />
            <Tile testId="tile-wins" label="Wins" value={r.wins} />
            {p.hasMoney ? (
              <Tile
                testId="tile-net"
                label="Net"
                value={<span className={r.netCents > 0 ? 'text-correct' : r.netCents < 0 ? 'text-[#ff9c9c]' : ''}>{netLabel(r.netCents)}</span>}
              />
            ) : (
              <Tile testId="tile-top3" label="Top 3" value={r.top3} />
            )}
            <Tile testId="tile-picks" label="Picks" value={`${r.correct}-${r.graded - r.correct}`} />
            <Tile testId="tile-best" label="Best week" value={r.best ? <>{pct0(r.best.pct)} <span className="text-xs font-normal text-muted">Wk {r.best.weekNumber}</span></> : '–'} />
            <Tile testId="tile-tb" label="TB ±" value={r.avgTbDiff === null ? '–' : tbAvgLabel(r.avgTbDiff)} />
            <Tile testId="tile-streak" label="Streak" value={r.streak} />
            {p.hasMoney && <Tile testId="tile-top3" label="Top 3" value={r.top3} />}
            <Tile testId="tile-weeks" label="Weeks" value={r.weeks} />
          </section>

          <section aria-labelledby="by-week-h">
            <h2 id="by-week-h" className="mb-2 text-lg font-bold">
              Week by week
            </h2>
            <ol className="overflow-hidden rounded-2xl border border-border bg-surface">
              {p.weeks.flatMap((w) =>
                w.entries.map((e) => (
                  <li key={e.entryId} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/leaderboard/player/${userId}?week=${w.weekId}&entry=${e.entryId}`}
                      data-testid={`player-week-${w.weekNumber}`}
                      aria-label={`Week ${w.weekNumber}${e.label ? `, ${e.label}` : ''}: ${rankLabel(e.rank, e.tied)}, ${e.correct} correct. View picks`}
                      className="grid grid-cols-[4.5rem_3.5rem_1fr_auto] items-center gap-2 px-3 py-3"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">Week {w.weekNumber}</span>
                        {e.label && <span className="text-xs text-muted">{e.label}</span>}
                      </span>
                      <span
                        data-testid="week-finish"
                        className={`inline-flex items-center gap-1 font-bold ${e.rank === 1 ? 'text-accent-bright' : ''}`}
                      >
                        {e.rank === 1 && <Trophy size={14} aria-hidden="true" />}
                        {rankLabel(e.rank, e.tied)}
                      </span>
                      <span className="flex flex-col text-sm">
                        <span data-testid="week-score" className="tabular-nums">
                          {e.correct}-{e.total - e.correct}
                          <span className="text-muted"> · {e.total > 0 ? pct0(e.correct / e.total) : '–'}</span>
                        </span>
                        {e.tbDiff !== null && <span className="text-xs text-muted">TB ±{e.tbDiff}</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        {e.payoutCents > 0 && (
                          <span data-testid="week-payout" className="text-sm font-bold text-correct">
                            +{formatMoney(e.payoutCents)}
                          </span>
                        )}
                        <ChevronRight size={16} className="text-muted" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                )),
              )}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
