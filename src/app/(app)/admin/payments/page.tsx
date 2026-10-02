import NoWeeks from '@/components/NoWeeks';
import { requireAdmin } from '@/lib/auth';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
import { adminEditLabel } from '@/lib/week-view';
import PaymentsList from './PaymentsList';

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  await requireAdmin(); // layouts are skipped on partial renders: every page enforces auth itself
  const { week: weekParam } = await searchParams;
  const { week } = await getSelectedWeek(weekParam);
  if (!week) return <NoWeeks />;
  const entries = await listEntries(week.id);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Payments</h1>
      <PaymentsList
        key={week.id}
        weekId={week.id}
        entries={entries.map((e) => ({
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
