import { Check, X } from 'lucide-react';
import LiveBadge from '@/components/LiveBadge';
import TeamLogo from '@/components/TeamLogo';
import { displayScore, liveLabel, liveStanding, type LiveStanding } from '@/lib/game-view';
import type { GameRow } from '@/lib/selected-week';
import type { EntryRecord } from '@/lib/picks';
import { scoreEntry, type Side } from '@/lib/scoring';
import { formatPT } from '@/lib/time';
import { adminEditLabel } from '@/lib/week-view';

type Mark = 'right' | 'wrong' | 'pending' | 'void';

function markFor(g: GameRow, pick: Side | undefined): Mark {
  if (g.status === 'void') return 'void';
  if (g.status !== 'final' || g.winner === null) return 'pending';
  return g.winner !== 'tie' && pick === g.winner ? 'right' : 'wrong';
}

const MARK_STYLE: Record<Mark, string> = {
  right: 'border-correct bg-correct/15 text-[#8ff0bc]',
  wrong: 'border-wrong bg-wrong/15 text-[#ff9c9c] line-through',
  pending: 'border-accent bg-accent/15 text-accent-bright',
  void: 'border-border bg-surface-2 text-muted',
};

const STANDING: Record<LiveStanding, { text: string; className: string }> = {
  leading: { text: 'Winning', className: 'font-semibold text-[#8ff0bc]' },
  trailing: { text: 'Losing', className: 'font-semibold text-[#ff9c9c]' },
  tied: { text: 'Tied', className: 'font-semibold text-fg' },
};

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === 'pending' || mark === 'void') return null;
  const Icon = mark === 'right' ? Check : X;
  return <Icon size={18} strokeWidth={3} role="img" aria-label={mark === 'right' ? 'Correct' : 'Wrong'} />;
}

export default function LockedPicks({
  games,
  entry,
  weekNumber,
  userName,
  tiebreakerLabel,
  lockShort,
  now,
  other = false,
}: {
  games: GameRow[];
  entry: EntryRecord | null;
  weekNumber: number;
  userName: string;
  tiebreakerLabel: string;
  lockShort: string;
  /** Effective current time: an unsettled game that hasn't kicked off yet reads "Not started". */
  now: Date;
  /** Viewing another player's picks (Leaderboard drill-down). */
  other?: boolean;
}) {
  if (!entry) {
    return (
      <p data-testid="no-entry" className="rounded-xl border border-border bg-surface p-5 text-center text-muted">
        {other ? `${userName} didn't enter picks for Week ${weekNumber}.` : `You didn't enter picks for Week ${weekNumber}.`}
      </p>
    );
  }
  const scored = scoreEntry(games, { entryId: entry.entryId, userId: entry.userId, name: userName, paid: entry.paid, tiebreaker: entry.tiebreaker, picks: entry.picks });
  const editedLabel = adminEditLabel(entry.editedByName, entry.adminEditedAt);
  const chip = (n: number, label: string, id: string, tone = '') => (
    <div data-testid={id} className="flex-1 rounded-xl border border-border bg-surface px-3 py-2">
      <div data-testid={`${id}-count`} className={`text-3xl font-bold leading-none ${n > 0 ? tone : ''}`}>
        {n}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );

  const sectionLabel = (text: string, id: string) => (
    <h2 data-testid={id} className="-mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
      {text}
    </h2>
  );

  return (
    <div className="flex flex-col gap-4">
      {sectionLabel('Scorecard', 'score-heading')}
      <div className="flex gap-2">
        {chip(scored.correct, 'Correct', 'chip-correct', 'text-correct')}
        {chip(scored.wrong, 'Wrong', 'chip-wrong', 'text-wrong')}
        {chip(scored.pending, 'To play', 'chip-pending')}
      </div>

      {sectionLabel(other ? 'Picks' : 'Your picks', 'picks-heading')}

      {games.map((g) => {
        const pick = entry.picks[g.id];
        const mark = markFor(g, pick);
        const settled = g.status === 'final' && g.winner !== null;
        const tie = g.winner === 'tie';
        // Final score once settled; ESPN's in-game score while live (display only: the pick stays pending).
        const live = liveLabel(g);
        const shown = displayScore(g);
        const standing = liveStanding(pick, shown);
        const side = (s: Side, team: string) => {
          const score = shown ? shown[s] : null;
          const on = pick === s;
          return (
            <div
              data-testid={`team-${g.id}-${s}`}
              data-picked={on}
              className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border text-lg font-bold ${
                on ? MARK_STYLE[mark] : 'border-border bg-surface text-muted'
              }`}
            >
              {on && <MarkIcon mark={mark} />}
              <TeamLogo abbr={team} size={22} />
              <span>{team}</span>
              {score !== null && (
                <span data-testid={`score-${g.id}-${s}`} className="text-sm font-semibold tabular-nums">
                  {score}
                </span>
              )}
            </div>
          );
        };
        return (
          <div key={g.id} data-testid={`game-${g.id}`} data-result={mark} data-live={!!live} className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex justify-between text-xs text-muted">
              {live ? (
                <LiveBadge label={live} testId={`game-status-${g.id}`} />
              ) : (
                <span data-testid={`game-status-${g.id}`}>{settled ? (tie ? 'Tie' : 'Final') : formatPT(g.kickoffAt, "EEE h:mm a 'PT'")}</span>
              )}
              <span data-testid={`game-mark-${g.id}`} className={standing ? STANDING[standing].className : undefined}>
                {standing
                  ? STANDING[standing].text
                  : mark === 'right'
                  ? 'Correct'
                  : mark === 'wrong'
                    ? tie
                      ? 'Wrong (tie)'
                      : 'Wrong'
                    : mark === 'void'
                      ? 'Void'
                      : g.status === 'postponed'
                        ? 'Postponed'
                        : g.kickoffAt > now
                          ? 'Not started'
                          : 'Pending'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {side('away', g.awayTeam)}
              <span aria-hidden="true" className="text-sm text-muted">@</span>
              {side('home', g.homeTeam)}
            </div>
          </div>
        );
      })}

      <div data-testid="tiebreaker-guess" className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-3">
        <span className="text-sm text-muted">{tiebreakerLabel}</span>
        <span className="text-2xl font-bold">{entry.tiebreaker}</span>
      </div>

      <div data-testid="locked-info" className="flex flex-col gap-1 text-sm text-muted">
        <p>Picks locked {lockShort} · {other ? 'their' : 'your'} pick is highlighted</p>
        {editedLabel && <p data-testid="admin-edited">{editedLabel}</p>}
      </div>
    </div>
  );
}
