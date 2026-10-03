import NoWeeks from '@/components/NoWeeks';
import RevealedCard from '@/components/RevealedCard';
import TeamLogo from '@/components/TeamLogo';
import { liveLabel } from '@/lib/game-view';
import { requireUser } from '@/lib/auth';
import { getEntries, listEntries } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { getSelectedWeek, type GameRow } from '@/lib/selected-week';
import { refreshWithBudget } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock } from '@/lib/weeks';
import { loadWeekSummary } from '@/lib/week-data';

function statusText(g: GameRow): string {
  if (g.status === 'void') return 'Void';
  if (g.status === 'postponed') return 'Postponed';
  if (g.status !== 'final' || g.winner === null) return formatPT(g.kickoffAt, "EEE h:mm a 'PT'");
  return g.winner === 'tie' ? 'Tie' : 'Final';
}

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await refreshWithBudget(t);
    sel = await getSelectedWeek(weekParam, t);
  }
  const { week, games, state } = sel;
  if (!week || !state)
    return (
      <>
        <h1 className="mb-3 text-2xl font-bold">Games</h1>
        <NoWeeks />
      </>
    );

  if (state === 'open') {
    const entries = await listEntries(week.id);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Games</h1>
        <RevealedCard lockShort={formatPT(effectiveLock(week), "EEE h:mm a 'PT'")} count={entries.length} viewerId={user.id} />
      </div>
    );
  }

  const summary = await loadWeekSummary(week, games, t);
  const mine = await getEntries(user.id, week.id); // the viewer's own sides, even when unpaid
  const counted = summary.ranked.length;
  // "N counted players" unless someone has several paid entries, then count entries.
  const countedPlayers = new Set(summary.ranked.map((e) => e.userId)).size;
  const countedNoun = counted === countedPlayers ? `player${counted === 1 ? '' : 's'}` : 'entries';

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Games</h1>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Who picked what</h2>
        <span data-testid="counted-players" className="text-sm text-muted">{counted} counted {countedNoun}</span>
      </div>
      <p data-testid="games-status" className="-mt-2 text-sm text-muted">
        {summary.isFinal ? 'Final' : 'In progress'} · {summary.gamesFinal} of {summary.gamesTotal} games final
      </p>

      {games.map((g) => {
        const split = summary.splits[g.id] ?? { home: 0, away: 0 };
        const total = split.home + split.away;
        // How many of the viewer's entries took each side (usually one entry: 0 or 1).
        const myCount = (s: Side) => mine.filter((e) => e.picks[g.id] === s).length;
        const settled = g.status === 'final' && g.winner !== null;
        const live = liveLabel(g);
        // Final score once settled; ESPN's in-game score while live (display only, never scored).
        const scoreOf = (s: Side) =>
          settled ? (s === 'home' ? g.homeScore : g.awayScore) : live ? (s === 'home' ? g.liveHomeScore : g.liveAwayScore) : null;
        const side = (s: Side, team: string) => {
          const won = settled && g.winner === s;
          const score = scoreOf(s);
          const other = scoreOf(s === 'home' ? 'away' : 'home');
          const trailing = score !== null && other !== null && score < other;
          const count = split[s];
          const yours = myCount(s);
          return (
            <div
              data-testid={`split-${g.id}-${s}`}
              data-winner={won}
              data-yours={yours > 0}
              data-yours-count={yours}
              className={`flex-1 rounded-lg border px-2 py-2 ${s === 'home' ? 'text-right' : ''} ${
                won ? 'border-correct/60 bg-correct/10' : 'border-border bg-surface-2'
              }`}
            >
              <div className={`flex items-center gap-2 text-lg font-bold ${s === 'home' ? 'flex-row-reverse' : ''}`}>
                <TeamLogo abbr={team} size={28} />
                <span>{team}</span>
                {score !== null && (
                  <span
                    data-testid={`score-${g.id}-${s}`}
                    className={`text-2xl tabular-nums ${s === 'home' ? 'mr-auto' : 'ml-auto'} ${trailing ? 'text-muted' : ''}`}
                  >
                    {score}
                  </span>
                )}
                {won && <span className="sr-only">(winner)</span>}
              </div>
              <div className="text-sm">{count} picked {team}</div>
              {yours > 0 && (
                <span
                  data-testid={mine.length > 1 ? `your-pick-${g.id}-${s}` : `your-pick-${g.id}`}
                  className="mt-1 inline-block rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-accent"
                >
                  Your pick{mine.length > 1 && <> ×{yours}<span className="sr-only"> (entries)</span></>}
                </span>
              )}
            </div>
          );
        };
        const isVoid = g.status === 'void';
        const awayPct = total === 0 ? 0 : (split.away / total) * 100;
        return (
          <div
            key={g.id}
            data-testid={`game-card-${g.id}`}
            data-void={isVoid}
            className={`rounded-xl border border-border bg-surface p-3 ${isVoid ? 'opacity-60' : ''}`}
          >
            <div className="mb-2 flex justify-between text-xs text-muted">
              {live ? (
                <span data-testid={`game-status-${g.id}`} data-live="true" className="inline-flex items-center gap-1.5 font-bold text-[#ff9c9c]">
                  <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-current" />
                  <span className="sr-only">Live: </span>
                  {live}
                </span>
              ) : (
                <span data-testid={`game-status-${g.id}`}>{statusText(g)}</span>
              )}
              <span>{g.awayTeam} @ {g.homeTeam}</span>
            </div>
            <div className="flex items-stretch gap-2">
              {side('away', g.awayTeam)}
              {side('home', g.homeTeam)}
            </div>
            <div
              role="img"
              aria-label={`${split.away} picked ${g.awayTeam}, ${split.home} picked ${g.homeTeam}`}
              data-testid={`split-bar-${g.id}`}
              className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div className={isVoid ? 'bg-muted/40' : 'bg-accent'} style={{ width: `${awayPct}%` }} />
              <div className={isVoid ? 'bg-muted/20' : 'bg-accent-bright/40'} style={{ width: `${total === 0 ? 0 : 100 - awayPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
