import LiveBadge from '@/components/LiveBadge';
import NoWeeks from '@/components/NoWeeks';
import RevealedCard from '@/components/RevealedCard';
import TeamLogo from '@/components/TeamLogo';
import { displayScore, entryCount, liveLabel, splitPercents } from '@/lib/game-view';
import { barColors } from '@/lib/team-colors';
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
        // How many of the viewer's entries took each side (usually one entry: 0 or 1).
        const myCount = (s: Side) => mine.filter((e) => e.picks[g.id] === s).length;
        const settled = g.status === 'final' && g.winner !== null;
        const live = liveLabel(g);
        // Final score once settled; ESPN's in-game score while live (display only, never scored).
        const shown = displayScore(g);
        const scoreOf = (s: Side) => (shown ? shown[s] : null);
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
              <div className="text-sm">
                {entryCount(count)}
                <span className="sr-only"> picked {team}</span>
              </div>
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
        const pct = splitPercents(split.away, split.home);
        // Each side in its team's color (kept visible on the card and distinct from the opponent).
        const colors = barColors(g.awayTeam, g.homeTeam);
        const segment = (sd: Side) => {
          const n = split[sd];
          if (n === 0) return null;
          const color = isVoid ? 'var(--muted)' : colors[sd];
          return (
            <div
              data-testid={`split-seg-${g.id}-${sd}`}
              data-color={isVoid ? 'void' : colors[sd]}
              className={`basis-0 ${isVoid ? 'opacity-40' : ''}`}
              style={{ flexGrow: n, background: color }}
            />
          );
        };
        const pctLabel = (sd: Side, team: string) => (
          <span data-testid={`split-pct-${g.id}-${sd}`} className={`flex items-center gap-1.5 ${sd === 'home' ? 'flex-row-reverse' : ''}`}>
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-sm ${isVoid ? 'opacity-40' : ''}`}
              style={{ background: isVoid ? 'var(--muted)' : colors[sd] }}
            />
            <span>
              {team} <span className="tabular-nums text-fg">{pct?.[sd]}%</span>
            </span>
          </span>
        );
        return (
          <div
            key={g.id}
            data-testid={`game-card-${g.id}`}
            data-void={isVoid}
            className={`rounded-xl border border-border bg-surface p-3 ${isVoid ? 'opacity-60' : ''}`}
          >
            <div className="mb-2 flex justify-between text-xs text-muted">
              {live ? (
                <LiveBadge label={live} testId={`game-status-${g.id}`} />
              ) : (
                <span data-testid={`game-status-${g.id}`}>{statusText(g)}</span>
              )}
              <span>{g.awayTeam} @ {g.homeTeam}</span>
            </div>
            <div className="flex items-stretch gap-2">
              {side('away', g.awayTeam)}
              {side('home', g.homeTeam)}
            </div>
            {/* Share of counted entries per side: a two-segment bar (away | home, team colors) with percentages under each end. */}
            <div className="mt-3">
              <div
                role="img"
                aria-label={
                  pct
                    ? `${entryCount(split.away)} picked ${g.awayTeam} (${pct.away}%), ${entryCount(split.home)} picked ${g.homeTeam} (${pct.home}%)`
                    : 'No counted entries'
                }
                data-testid={`split-bar-${g.id}`}
                className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-surface-2"
              >
                {segment('away')}
                {segment('home')}
              </div>
              {pct && (
                <div aria-hidden="true" className="mt-1.5 flex justify-between text-xs font-semibold text-muted">
                  {pctLabel('away', g.awayTeam)}
                  {pctLabel('home', g.homeTeam)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
