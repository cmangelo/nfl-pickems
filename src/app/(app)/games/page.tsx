import NoWeeks from '@/components/NoWeeks';
import RevealedCard from '@/components/RevealedCard';
import { requireUser } from '@/lib/auth';
import { getEntry, listEntries } from '@/lib/picks';
import type { Side } from '@/lib/scoring';
import { getSelectedWeek, type GameRow } from '@/lib/selected-week';
import { maybeRefresh } from '@/lib/sync';
import { formatPT, now as getNow } from '@/lib/time';
import { effectiveLock } from '@/lib/weeks';
import { loadWeekSummary } from '@/lib/week-data';

function statusText(g: GameRow): string {
  if (g.status !== 'final' || g.winner === null) return formatPT(g.kickoffAt, "EEE h:mm a 'PT'");
  return g.winner === 'tie' ? 'Tie' : 'Final';
}

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await maybeRefresh(t);
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

  const summary = await loadWeekSummary(week.id, games);
  const mine = await getEntry(user.id, week.id); // the viewer's own side, even when unpaid
  const counted = summary.ranked.length;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Games</h1>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Who picked what</h2>
        <span data-testid="counted-players" className="text-sm text-muted">{counted} counted player{counted === 1 ? '' : 's'}</span>
      </div>
      <p data-testid="games-status" className="-mt-2 text-sm text-muted">
        {summary.isFinal ? 'Final' : 'In progress'} · {summary.gamesFinal} of {summary.gamesTotal} games final
      </p>

      {games.map((g) => {
        const split = summary.splits[g.id] ?? { home: 0, away: 0 };
        const total = split.home + split.away;
        const myPick: Side | undefined = mine?.picks[g.id];
        const settled = g.status === 'final' && g.winner !== null;
        const side = (s: Side, team: string, score: number | null) => {
          const won = settled && g.winner === s;
          const count = split[s];
          return (
            <div
              data-testid={`split-${g.id}-${s}`}
              data-winner={won}
              data-yours={myPick === s}
              className={`flex-1 rounded-lg border px-2 py-2 ${s === 'home' ? 'text-right' : ''} ${
                won ? 'border-correct/60 bg-correct/10' : 'border-border bg-surface-2'
              }`}
            >
              <div className={`flex items-center gap-1.5 text-lg font-bold ${s === 'home' ? 'justify-end' : ''}`}>
                <span>{team}</span>
                {settled && score !== null && <span className="text-sm font-semibold">{score}</span>}
                {won && <span className="sr-only">(winner)</span>}
              </div>
              <div className="text-sm">{count} picked {team}</div>
              {myPick === s && (
                <span
                  data-testid={`your-pick-${g.id}`}
                  className="mt-1 inline-block rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-bg"
                >
                  Your pick
                </span>
              )}
            </div>
          );
        };
        const awayPct = total === 0 ? 0 : (split.away / total) * 100;
        return (
          <div key={g.id} data-testid={`game-card-${g.id}`} className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span data-testid={`game-status-${g.id}`}>{statusText(g)}</span>
              <span>{g.awayTeam} @ {g.homeTeam}</span>
            </div>
            <div className="flex items-stretch gap-2">
              {side('away', g.awayTeam, g.awayScore)}
              {side('home', g.homeTeam, g.homeScore)}
            </div>
            <div
              role="img"
              aria-label={`${split.away} picked ${g.awayTeam}, ${split.home} picked ${g.homeTeam}`}
              data-testid={`split-bar-${g.id}`}
              className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="bg-accent" style={{ width: `${awayPct}%` }} />
              <div className="bg-accent-bright/40" style={{ width: `${total === 0 ? 0 : 100 - awayPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
