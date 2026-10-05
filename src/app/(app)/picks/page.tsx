import Link from 'next/link';
import NoWeeks from '@/components/NoWeeks';
import { requireUser } from '@/lib/auth';
import { selectEntry } from '@/lib/entry-select';
import { getEntries } from '@/lib/picks';
import { draftKey } from '@/lib/picks-draft';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT, now as getNow } from '@/lib/time';
import { refreshWithBudget } from '@/lib/sync';
import { effectiveLock, resolveTiebreakerGame } from '@/lib/weeks';
import { groupGamesByPtDay } from '@/lib/week-view';
import { deleteEntryAction } from './actions';
import AddEntryCard from './AddEntryCard';
import Countdown from './Countdown';
import EntryTabs from './EntryTabs';
import LockedPicks from './LockedPicks';
import PicksForm from './PicksForm';
import RemoveEntryButton from './RemoveEntryButton';

type Params = { week?: string | string[]; entry?: string | string[]; copy?: string | string[]; saved?: string | string[] };

export default async function PicksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const weekParam = sp.week;
  const t = await getNow();
  let sel = await getSelectedWeek(weekParam, t);
  if (sel.state === 'locked') {
    await refreshWithBudget(t); // refresh-on-view: throttled, time-boxed, never throws
    sel = await getSelectedWeek(weekParam, t);
  }
  const { week, games, state } = sel;
  if (!week || !state)
    return (
      <>
        <h1 className="mb-3 text-2xl font-bold">My Picks</h1>
        <NoWeeks />
      </>
    );

  const lock = effectiveLock(week);
  const tb = await resolveTiebreakerGame(week, games, t);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const mine = await getEntries(user.id, week.id);
  const { isNew, entry, index, copyFrom, canAdd } = selectEntry(mine, sp.entry, sp.copy, { allowNew: state === 'open' });
  const base = `/picks?week=${week.id}`;
  const entryName = (i: number) => `Entry ${i + 1}`;
  const tabs = [
    ...mine.map((e, i) => ({ key: String(i + 1), label: entryName(i), href: `${base}&entry=${e.entryId}`, current: e === entry })),
    ...(isNew ? [{ key: 'new', label: 'New entry', href: `${base}&entry=new`, current: true }] : []),
  ];

  let body: React.ReactNode;
  if (state === 'open') {
    if (games.length === 0) return <NoWeeks />;
    const days = groupGamesByPtDay(games).map((d) => ({
      key: d.key,
      label: d.label,
      games: d.games.map((g) => ({ id: g.id, away: g.awayTeam, home: g.homeTeam, time: formatPT(g.kickoffAt, "h:mm a 'PT'") })),
    }));
    body = (
      <>
        <div className="mb-4 rounded-xl border border-border bg-surface p-3">
          <div data-testid="lock-info" className="font-semibold">Locks {formatPT(lock, "EEE, MMM d · h:mm a 'PT'")}</div>
          <Countdown lockAt={lock.toISOString()} serverNow={t.toISOString()} />
        </div>
        <EntryTabs tabs={tabs} />
        {isNew && (
          <p data-testid="new-entry-notice" className="mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
            {copyFrom ? `New entry, starting from ${entryName(mine.indexOf(copyFrom))}'s picks. ` : 'New entry. '}
            It&apos;s a separate entry fee and counts once an admin marks it paid.{' '}
            <Link href={base} data-testid="new-entry-cancel" className="font-semibold text-accent-bright">Cancel</Link>
          </p>
        )}
        <PicksForm
          // Keyed by entry so switching or removing an entry never keeps another entry's unsaved state.
          key={`${week.id}-${isNew ? `new-${copyFrom?.entryId ?? ''}` : (entry?.entryId ?? 'none')}`}
          weekId={week.id}
          days={days}
          initialPicks={(isNew ? copyFrom : entry)?.picks ?? {}}
          initialTiebreaker={(isNew ? copyFrom : entry)?.tiebreaker ?? null}
          tiebreakerLabel={tbLabel}
          lockShort={formatPT(lock, "EEE h:mm a 'PT'")}
          hasEntry={!!entry}
          target={isNew ? { newEntry: true } : entry ? { entryId: entry.entryId } : undefined}
          // Creating an entry (the first one or another) navigates to it, remounting the form on it.
          savedHrefBase={isNew || !entry ? `${base}&saved=1&entry=` : undefined}
          initialSaved={!isNew && sp.saved === '1'}
          draft={{
            userId: user.id,
            key: draftKey(
              user.id,
              week.id,
              isNew ? { newEntry: true, copyOf: copyFrom?.entryId } : entry ? { entryId: entry.entryId } : { first: true },
            ),
          }}
          savedMessage={
            isNew || mine.length > 1
              ? `${isNew ? 'New entry' : entryName(index)} saved. You can change it until ${formatPT(lock, "EEE h:mm a 'PT'")}.`
              : undefined
          }
        />
        {entry && mine.length > 1 && !entry.paid && (
          <RemoveEntryButton
            key={entry.entryId}
            action={deleteEntryAction.bind(null, entry.entryId)}
            label={entryName(index)}
            afterHref={base}
          />
        )}
        {entry && mine.length > 1 && entry.paid && (
          <p data-testid="paid-entry-note" className="mt-4 text-center text-sm text-muted">
            {entryName(index)} is marked paid. Ask an admin if you need it removed.
          </p>
        )}
        {canAdd && !isNew && entry && (
          <AddEntryCard
            newHref={`${base}&entry=new`}
            copyHref={`${base}&entry=new&copy=${entry.entryId}`}
            copyLabel={mine.length > 1 ? `Copy ${entryName(index)}` : 'Copy my picks'}
          />
        )}
      </>
    );
  } else {
    body = (
      <>
        <EntryTabs tabs={tabs} />
        <LockedPicks
          games={games}
          entry={entry}
          weekNumber={week.weekNumber}
          userName={mine.length > 1 ? `${user.firstName} (${index + 1})` : user.firstName}
          tiebreakerLabel={tbLabel}
          lockShort={formatPT(lock, "EEE h:mm a 'PT'")}
          now={t}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">My Picks</h1>
      {body}
    </div>
  );
}
