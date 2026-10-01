import Link from 'next/link';
import NoWeeks from '@/components/NoWeeks';
import { listUsers, toPtInputValue } from '@/lib/admin';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { getLastSyncedAt } from '@/lib/sync';
import { formatPT } from '@/lib/time';
import { effectiveLock } from '@/lib/weeks';
import GameEditor from './GameEditor';
import { LockPanel, SyncPanel } from './Panels';

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const { week: weekParam } = await searchParams;
  const { week, games } = await getSelectedWeek(weekParam);
  if (!week) return <NoWeeks />;
  const [last, users, entries] = await Promise.all([getLastSyncedAt(), listUsers(), listEntries(week.id)]);
  const lock = effectiveLock(week);
  const entered = new Set(entries.map((e) => e.userId));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Games</h1>
      <SyncPanel weekId={week.id} lastSynced={last ? formatPT(last, "EEE MMM d, h:mm a 'PT'") : 'never'} />
      <LockPanel
        weekId={week.id}
        lockLabel={formatPT(lock, "EEE MMM d, h:mm a 'PT'")}
        isOverride={!!week.lockOverrideAt}
        inputValue={toPtInputValue(lock)}
      />

      <section aria-label="Games" className="overflow-hidden rounded-xl border border-border bg-surface">
        {games.length === 0 && <p className="p-4 text-center text-muted">No games in this week.</p>}
        {games.map((g) => (
          <GameEditor
            key={`${g.id}-${g.status}-${g.homeScore}-${g.awayScore}-${g.winner}-${g.manualOverride}`}
            game={{
              id: g.id,
              away: g.awayTeam,
              home: g.homeTeam,
              awayScore: g.awayScore,
              homeScore: g.homeScore,
              final: g.status === 'final',
              winner: g.winner,
              manual: g.manualOverride,
              kickoff: formatPT(g.kickoffAt, 'EEE h:mm a'),
            }}
          />
        ))}
      </section>

      <section aria-label="Edit picks" className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Edit a player&apos;s picks</h2>
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {users.map((u) => (
            <li key={u.id} data-testid={`edit-picks-${u.username}`} className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1 truncate font-semibold">
                {u.firstName} <span className="font-normal text-muted">@{u.username}</span>
                {!entered.has(u.id) && <span className="ml-2 text-xs font-normal text-muted">no picks yet</span>}
              </div>
              <Link
                href={`/admin/picks/${u.id}?week=${week.id}`}
                aria-label={`Edit picks for ${u.firstName}`}
                className="text-sm font-semibold text-accent-bright"
              >
                {entered.has(u.id) ? 'Edit picks' : 'Add picks'}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
