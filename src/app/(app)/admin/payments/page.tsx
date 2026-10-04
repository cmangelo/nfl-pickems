import NoWeeks from '@/components/NoWeeks';
import { requireAdmin } from '@/lib/auth';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
import { loadEntryFee } from '@/lib/week-data';
import { adminEditLabel } from '@/lib/week-view';
import EntryFeePanel from './EntryFeePanel';
import PaymentsList from './PaymentsList';

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  await requireAdmin(); // layouts are skipped on partial renders: every page enforces auth itself
  const { week: weekParam } = await searchParams;
  const { week } = await getSelectedWeek(weekParam);
  if (!week) return <NoWeeks />;
  const entries = await listEntries(week.id);
  const fee = await loadEntryFee(week);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Payments</h1>
      <EntryFeePanel
        key={`fee-${week.id}`}
        weekId={week.id}
        weekNumber={week.weekNumber}
        feeCents={fee?.cents ?? null}
        fromLabel={fee ? `${fee.season === week.season ? '' : `${fee.season} `}Week ${fee.weekNumber}` : null}
        ownFeeCents={week.entryFeeCents}
      />
      <PaymentsList
        key={week.id}
        weekId={week.id}
        feeCents={fee?.cents ?? null}
        entries={entries.map((e) => ({
          entryId: e.entryId,
          entryIndex: e.entryIndex,
          entryCount: e.entryCount,
          label: e.label,
          userId: e.userId,
          firstName: e.firstName,
          username: e.username,
          submitted: formatPT(e.submittedAt, "EEE h:mm a"),
          paid: e.paid,
          edited: adminEditLabel(e.editedByName, e.adminEditedAt),
        }))}
      />
    </div>
  );
}
