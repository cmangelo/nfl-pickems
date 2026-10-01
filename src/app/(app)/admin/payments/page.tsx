import NoWeeks from '@/components/NoWeeks';
import { listEntries } from '@/lib/picks';
import { getSelectedWeek } from '@/lib/selected-week';
import { formatPT } from '@/lib/time';
import PaymentsList from './PaymentsList';

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
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
        }))}
      />
    </div>
  );
}
