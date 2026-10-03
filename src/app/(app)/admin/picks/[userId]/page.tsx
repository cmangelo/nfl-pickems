import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { isId } from '@/lib/validate';
import NoWeeks from '@/components/NoWeeks';
import { selectEntry } from '@/lib/entry-select';
import { getEntries } from '@/lib/picks';
import { requireAdmin } from '@/lib/auth';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
import { resolveTiebreakerGame } from '@/lib/weeks';
import { groupGamesByPtDay } from '@/lib/week-view';
import AddEntryCard from '../../../picks/AddEntryCard';
import EntryTabs from '../../../picks/EntryTabs';
import PicksForm from '../../../picks/PicksForm';
import RemoveEntryButton from '../../../picks/RemoveEntryButton';
import { adminDeleteEntryAction, adminSubmitPicksAction } from '../../actions';

export default async function AdminEditPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ week?: string | string[]; entry?: string | string[]; copy?: string | string[]; saved?: string | string[] }>;
}) {
  const me = await requireAdmin();
  const { userId: rawId } = await params;
  const sp = await searchParams;
  const weekParam = sp.week;
  if (!/^\d+$/.test(rawId) || !isId(Number(rawId))) notFound();
  const userId = Number(rawId);
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.deactivatedAt) notFound();
  const { week, games, state, now } = await getSelectedWeek(weekParam);
  if (!week || games.length === 0) return <NoWeeks />;

  // While the week is open another player's picks stay hidden from the admin: blank form, replace-only.
  const hidden = state === 'open' && user.id !== me.id;
  const mine = await getEntries(userId, week.id);
  // Admins may add an entry for a player at any time (e.g. picks texted in after the lock).
  const { isNew, entry, index, copyFrom: copySrc, canAdd } = selectEntry(mine, sp.entry, sp.copy);
  const copyFrom = hidden ? null : copySrc;
  const shown = hidden ? null : isNew ? copyFrom : entry;
  const base = `/admin/picks/${userId}?week=${week.id}`;
  const entryName = (i: number) => `Entry ${i + 1}`;
  const tabs = [
    ...mine.map((e, i) => ({ key: String(i + 1), label: entryName(i), href: `${base}&entry=${e.entryId}`, current: e === entry })),
    ...(isNew ? [{ key: 'new', label: 'New entry', href: `${base}&entry=new`, current: true }] : []),
  ];
  const which = isNew ? 'New entry' : mine.length > 1 ? entryName(index) : null;
  const tb = await resolveTiebreakerGame(week, games, now);
  const tbLabel = tb
    ? `Total points in ${tb.awayTeam} @ ${tb.homeTeam} (${formatPT(tb.kickoffAt, 'EEE h:mm a')})`
    : 'Tiebreaker';
  const days = groupGamesByPtDay(games).map((d) => ({
    key: d.key,
    label: d.label,
    games: d.games.map((g) => ({ id: g.id, away: g.awayTeam, home: g.homeTeam, time: formatPT(g.kickoffAt, "h:mm a 'PT'") })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/admin/payments?week=${week.id}`} className="inline-flex items-center gap-0.5 text-sm font-semibold text-accent-bright">
          <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
          Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Edit picks: {user.firstName} <span className="text-base font-normal text-muted">@{user.username}</span>
        </h1>
        {isNew ? (
          <p data-testid="new-entry-notice" className="text-sm text-muted">
            Week {week.weekNumber}. New entry for {user.firstName}
            {copyFrom ? `, starting from ${entryName(mine.indexOf(copyFrom))}'s picks` : ''}. It starts unpaid.{' '}
            <Link href={base} className="font-semibold text-accent-bright">Cancel</Link>
          </p>
        ) : hidden ? (
          <p data-testid="picks-hidden-notice" className="text-sm text-muted">
            Week {week.weekNumber}. Picks are hidden until the lock. Saving replaces this player&apos;s picks.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Week {week.weekNumber}. {entry ? 'Changes replace their current picks.' : 'No picks yet; this creates their entry.'} Works after the lock too.
          </p>
        )}
      </div>
      <EntryTabs tabs={tabs} />
      <PicksForm
        key={`${week.id}-${userId}-${isNew ? `new-${copyFrom?.entryId ?? ''}` : (entry?.entryId ?? 'none')}`}
        weekId={week.id}
        days={days}
        initialPicks={shown?.picks ?? {}}
        initialTiebreaker={shown?.tiebreaker ?? null}
        tiebreakerLabel={tbLabel}
        lockShort=""
        hasEntry={!!entry}
        savedMessage={`${which ? `${which} saved` : 'Picks saved'} for ${user.firstName}.`}
        initialSaved={!isNew && sp.saved === '1'}
        savedHrefBase={isNew || !entry ? `${base}&saved=1&entry=` : undefined}
        submitAction={adminSubmitPicksAction.bind(
          null,
          userId,
          week.id,
          isNew ? { newEntry: true } : entry ? { entryId: entry.entryId } : undefined,
        )}
      />
      {entry && (
        <RemoveEntryButton
          key={entry.entryId}
          action={adminDeleteEntryAction.bind(null, entry.entryId)}
          label={mine.length > 1 ? entryName(index) : 'this entry'}
          afterHref={base}
          warning={entry.paid ? 'This entry is marked paid; removing it also removes its payment record.' : undefined}
        />
      )}
      {canAdd && !isNew && (
        <AddEntryCard
          newHref={`${base}&entry=new`}
          copyHref={hidden ? null : `${base}&entry=new&copy=${entry!.entryId}`}
          copyLabel={mine.length > 1 ? `Copy ${entryName(index)}` : 'Copy their picks'}
          note={`Each entry is a separate entry fee, tracked on the Payments tab.`}
        />
      )}
    </div>
  );
}
