import Link from 'next/link';
import { avatarColors, initial, pickResults, tiebreakerDiffLabel, type PickResult } from '@/lib/leaderboard-view';
import type { RankedEntry, ScoredEntry, ScoringGame } from '@/lib/scoring';
import { rankLabel } from '@/lib/week-view';

const href = (e: { userId: number; entryId: number }, weekId: number) =>
  `/leaderboard/player/${e.userId}?week=${weekId}&entry=${e.entryId}`;

const DOT: Record<PickResult, string> = {
  right: 'bg-correct',
  wrong: 'bg-wrong',
  tie: 'bg-muted',
  pending: 'border border-muted/70',
  void: 'bg-border',
  none: 'bg-border',
};

export function Avatar({ userId, name, size = 36 }: { userId: number; name: string; size?: number }) {
  const { bg, fg } = avatarColors(userId);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.44 }}
    >
      {initial(name)}
    </span>
  );
}

/** One small mark per game (kickoff order): green right, red wrong, grey tie/void, outline still to play. */
function PickStrip({ games, picks }: { games: ScoringGame[]; picks: ScoredEntry['picks'] }) {
  return (
    <span data-testid="pick-strip" aria-hidden="true" className="flex flex-wrap gap-[3px]">
      {pickResults(games, picks).map((r) => (
        <span key={r.gameId} data-result={r.result} className={`h-[7px] w-[7px] rounded-full ${DOT[r.result]}`} />
      ))}
    </span>
  );
}

export function RankedTable({
  ranked,
  games,
  weekId,
  viewerId,
  showDiff,
  live = false,
  eliminated = [],
}: {
  ranked: RankedEntry[];
  games: ScoringGame[];
  weekId: number;
  viewerId: number;
  /** Tiebreaker game is final: show the (±diff) next to each guess. */
  showDiff: boolean;
  /** Week in progress: adds the MAX column (correct + still to play). */
  live?: boolean;
  /** Entries that can no longer finish 1st (live board only): tagged "OUT". */
  eliminated?: number[];
}) {
  const out = new Set(eliminated);
  if (ranked.length === 0) {
    return (
      <p data-testid="no-ranked" className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
        No counted entries yet. Entries count once an admin marks them paid.
      </p>
    );
  }
  const cols = live ? 'grid-cols-[2.5rem_1fr_2.5rem_3rem]' : 'grid-cols-[2.5rem_1fr_3rem]';
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className={`grid ${cols} items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted`}>
        <span>Rank</span>
        <span>Player</span>
        {live && <span className="text-right">Max</span>}
        <span className="text-right">Correct</span>
      </div>
      <ol>
        {ranked.map((e) => {
          const isOut = out.has(e.entryId);
          const me = e.userId === viewerId;
          return (
            <li key={e.entryId} className="border-b border-border last:border-b-0">
              <Link
                href={href(e, weekId)}
                data-testid={`rank-row-${e.entryId}`}
                aria-label={`${e.name}, ${rankLabel(e.rank, e.tied)}, ${e.correct} correct${isOut ? ', eliminated' : ''}. View picks`}
                className={`grid ${cols} items-center gap-2 px-3 py-3 ${me ? 'bg-accent/10' : ''} ${isOut ? 'opacity-60' : ''}`}
              >
                <span data-testid="rank-label" className={`font-bold ${e.tied ? 'text-sm' : 'text-lg'} ${e.rank === 1 ? 'text-accent-bright' : ''}`}>
                  {rankLabel(e.rank, e.tied)}
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar userId={e.userId} name={e.name} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span data-testid="player-name" className="truncate font-semibold">{e.name}</span>
                      {me && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">YOU</span>}
                      {isOut && (
                        <span data-testid="out-badge" className="rounded border border-wrong/50 px-1.5 py-0.5 text-[10px] font-bold text-[#ff9c9c]">
                          OUT
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      MNF{' '}
                      <span data-testid="tb-guess">
                        {e.tiebreaker}
                        {showDiff && e.tiebreakerDiff !== null && <> {tiebreakerDiffLabel(e.tiebreakerDiff)}</>}
                      </span>
                    </span>
                    <PickStrip games={games} picks={e.picks} />
                  </span>
                </span>
                {live && (
                  <span data-testid="max-count" className="text-right text-sm text-muted">
                    {e.correct + e.pending}
                  </span>
                )}
                <span data-testid="correct-count" className="text-right text-xl font-bold">{e.correct}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function NotCounted({ entries, weekId }: { entries: ScoredEntry[]; weekId: number }) {
  if (entries.length === 0) return null;
  return (
    <section data-testid="not-counted" aria-labelledby="not-counted-h" className="mt-6">
      <h2 id="not-counted-h" className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Not counted · unpaid</h2>
      <p className="mb-2 text-xs text-muted">These entries are left out of the standings until an admin marks them paid.</p>
      <ul className="rounded-xl border border-border bg-surface opacity-60">
        {entries.map((e) => (
          <li key={e.entryId} className="border-b border-border last:border-b-0">
            <Link
              href={href(e, weekId)}
              data-testid={`unpaid-row-${e.entryId}`}
              className="flex items-center gap-2.5 px-3 py-3"
            >
              <Avatar userId={e.userId} name={e.name} size={28} />
              <span className="flex-1">{e.name}</span>
              <span className="text-sm text-muted">{e.correct} correct</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
