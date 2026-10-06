'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { compareRows, netLabel, pct0, pct1, SORT_ASCENDING, tbAvgLabel, type SeasonRow, type SeasonSortKey } from '@/lib/season-view';
import Avatar from '@/components/Avatar';

interface Column {
  key: SeasonSortKey;
  label: string;
  /** Spoken header, for abbreviations. */
  title: string;
  cell: (r: SeasonRow) => React.ReactNode;
}

const dash = <span className="text-muted">–</span>;

const COLUMNS: Column[] = [
  { key: 'pct', label: 'Pct', title: 'Percent correct', cell: (r) => (r.pct === null ? dash : pct1(r.pct)) },
  { key: 'wins', label: 'Wins', title: 'Weekly wins', cell: (r) => r.wins },
  {
    key: 'correct',
    label: 'Picks',
    title: 'Correct picks',
    cell: (r) => (
      <>
        {r.correct}
        <span className="text-muted">-{r.graded - r.correct}</span>
      </>
    ),
  },
  {
    key: 'best',
    label: 'Best wk',
    title: 'Best week',
    cell: (r) =>
      r.best ? (
        <>
          {pct0(r.best.pct)} <span className="text-xs text-muted">W{r.best.weekNumber}</span>
        </>
      ) : (
        dash
      ),
  },
  { key: 'tb', label: 'TB ±', title: 'Average tiebreaker distance', cell: (r) => (r.avgTbDiff === null ? dash : tbAvgLabel(r.avgTbDiff)) },
  { key: 'streak', label: 'Streak', title: 'Longest correct streak', cell: (r) => r.streak },
  { key: 'top3', label: 'Top 3', title: 'Top 3 finishes', cell: (r) => r.top3 },
  { key: 'weeks', label: 'Wks', title: 'Weeks played', cell: (r) => r.weeks },
];

const NET: Column = {
  key: 'net',
  label: 'Net',
  title: 'Net winnings',
  cell: (r) => <span className={r.netCents > 0 ? 'text-correct' : r.netCents < 0 ? 'text-[#ff9c9c]' : ''}>{netLabel(r.netCents)}</span>,
};

/**
 * The season table: one row per player, sortable by any stat (tap a header; tap again to flip). Scrolls
 * sideways inside its card on a phone, with the player column pinned.
 */
export default function SeasonTable({
  rows,
  viewerId,
  hasMoney,
  weekId,
}: {
  rows: SeasonRow[];
  viewerId: number;
  hasMoney: boolean;
  /** Selected week, kept in the player links. */
  weekId: number;
}) {
  const [sort, setSort] = useState<{ key: SeasonSortKey; reverse: boolean }>({ key: 'pct', reverse: false });
  const columns = hasMoney ? [...COLUMNS.slice(0, 2), NET, ...COLUMNS.slice(2)] : COLUMNS;
  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.reverse)), [rows, sort]);

  const ariaSort = (key: SeasonSortKey) => {
    if (sort.key !== key) return undefined;
    return SORT_ASCENDING[key] !== sort.reverse ? 'ascending' : 'descending';
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface" data-testid="season-table-wrap">
      <table data-testid="season-table" className="w-full whitespace-nowrap text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left">
              Player
            </th>
            {columns.map((c) => {
              const on = sort.key === c.key;
              const Arrow = SORT_ASCENDING[c.key] !== sort.reverse ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort(c.key)} className="px-1 py-1 text-right">
                  <button
                    type="button"
                    data-testid={`sort-${c.key}`}
                    aria-label={`Sort by ${c.title}`}
                    title={c.title}
                    onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, reverse: !s.reverse } : { key: c.key, reverse: false }))}
                    className={`inline-flex min-h-8 items-center gap-0.5 rounded px-1.5 uppercase ${on ? 'text-accent-bright' : 'hover:text-fg'}`}
                  >
                    {c.label}
                    {on && <Arrow size={12} aria-hidden="true" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const me = r.userId === viewerId;
            // Opaque background on the pinned cell so scrolled columns slide under it.
            const pinned = me ? 'bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]' : 'bg-surface';
            return (
              <tr key={r.userId} data-testid={`season-row-${r.userId}`} className={`border-b border-border last:border-b-0 ${me ? 'bg-accent/10' : ''}`}>
                <th scope="row" className={`sticky left-0 z-10 px-3 py-2.5 text-left font-semibold ${pinned}`}>
                  <Link
                    href={`/leaderboard/season/player/${r.userId}?week=${weekId}`}
                    data-testid={`season-player-${r.userId}`}
                    aria-label={`${r.name}: season by week`}
                    className="flex items-center gap-2"
                  >
                    <Avatar userId={r.userId} name={r.name} size={28} />
                    <span data-testid="season-name" className="max-w-[7.5rem] truncate">{r.name}</span>
                    {me && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">YOU</span>}
                  </Link>
                </th>
                {columns.map((c) => (
                  <td key={c.key} data-testid={`cell-${c.key}`} className={`px-3 py-2.5 text-right ${sort.key === c.key ? 'font-bold' : ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
