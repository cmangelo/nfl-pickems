import { NO_GAMES_MESSAGE } from '@/lib/week-view';

export default function NoWeeks() {
  return (
    <div data-testid="no-weeks" className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
      {NO_GAMES_MESSAGE}
    </div>
  );
}
