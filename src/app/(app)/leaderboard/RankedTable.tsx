import Link from 'next/link';
import { tiebreakerDiffLabel } from '@/lib/leaderboard-view';
import type { RankedEntry, ScoredEntry } from '@/lib/scoring';
import { rankLabel } from '@/lib/week-view';

const href = (e: { userId: number; entryId: number }, weekId: number) =>
  `/leaderboard/player/${e.userId}?week=${weekId}&entry=${e.entryId}`;

export function RankedTable({
  ranked,
  weekId,
  viewerId,
  showDiff,
  eliminated = [],
}: {
  ranked: RankedEntry[];
  weekId: number;
  viewerId: number;
  /** Tiebreaker game is final: show the (±diff) next to each guess. */
  showDiff: boolean;
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
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[3.5rem_1fr_auto_3rem] gap-2 border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted">
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">TB guess</span>
        <span className="text-right">Correct</span>
      </div>
      <ol>
        {ranked.map((e) => (
          <li key={e.entryId} className="border-b border-border last:border-b-0">
            <Link
              href={href(e, weekId)}
              data-testid={`rank-row-${e.entryId}`}
              aria-label={`${e.name}, ${rankLabel(e.rank, e.tied)}, ${e.correct} correct${out.has(e.entryId) ? ', eliminated' : ''}. View picks`}
              className={`grid grid-cols-[3.5rem_1fr_auto_3rem] items-center gap-2 px-3 py-3 ${
                e.userId === viewerId ? 'bg-accent/10' : ''
              }`}
            >
              <span data-testid="rank-label" className="font-bold">{rankLabel(e.rank, e.tied)}</span>
              <span className="flex items-center gap-2 truncate">
                <span data-testid="player-name" className="truncate font-semibold">{e.name}</span>
                {e.userId === viewerId && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">YOU</span>
                )}
                {out.has(e.entryId) && (
                  <span data-testid="out-badge" className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted">
                    OUT
                  </span>
                )}
              </span>
              <span data-testid="tb-guess" className="text-right text-sm text-muted">
                {e.tiebreaker}
                {showDiff && e.tiebreakerDiff !== null && <> {tiebreakerDiffLabel(e.tiebreakerDiff)}</>}
              </span>
              <span data-testid="correct-count" className="text-right text-lg font-bold">{e.correct}</span>
            </Link>
          </li>
        ))}
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
              className="flex items-center justify-between px-3 py-3"
            >
              <span>{e.name}</span>
              <span className="text-sm text-muted">{e.correct} correct</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
