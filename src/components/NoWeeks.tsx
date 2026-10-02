import { getCurrentUser } from '@/lib/auth';
import { NO_GAMES_MESSAGE } from '@/lib/week-view';
import LoadScheduleButton from './LoadScheduleButton';

export default async function NoWeeks() {
  const user = await getCurrentUser();
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
      <p data-testid="no-weeks">{NO_GAMES_MESSAGE}</p>
      {user?.isAdmin && <LoadScheduleButton />}
    </div>
  );
}
