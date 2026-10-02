import Link from 'next/link';
import NoWeeks from '@/components/NoWeeks';
import WeekStatePill from '@/components/WeekStatePill';
import { requireUser } from '@/lib/auth';
import { getSelectedWeek } from '@/lib/selected-week';
import { refreshWithBudget } from '@/lib/sync';
import { now as getNow } from '@/lib/time';
import { loadWeekSummary } from '@/lib/week-data';
import { rankLabel, safeFrom } from '@/lib/week-view';

export default async function WeeksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; from?: string | string[] }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getNow();
  let sel = await getSelectedWeek(sp.week, t);
  if (sel.visibleWeeks.some((v) => v.state === 'locked')) {
    await refreshWithBudget(t); // refresh-on-view: throttled, time-boxed, never throws
    sel = await getSelectedWeek(sp.week, t);
  }
  const from = safeFrom(sp.from);
  if (sel.visibleWeeks.length === 0) return <NoWeeks />;

  const rows = await Promise.all(
    sel.visibleWeeks.map(async (v) => ({ v, summary: await loadWeekSummary(v.week, v.games, t) })),
  );

  return (
    <div>
      <h1 className="mb-3 text-2xl font-bold">Choose week</h1>
      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map(({ v, summary }) => {
          const { week, state } = v;
          const mine = [...summary.ranked, ...summary.notCounted].find((e) => e.userId === user.id);
          const ranked = summary.ranked.find((e) => e.userId === user.id);
          const won = state === 'final' && summary.winners.some((e) => e.userId === user.id);
          let you: string;
          if (!mine) you = state === 'open' ? "You haven't picked yet" : "You didn't play";
          else if (state === 'open') you = 'You: picks submitted';
          else if (state === 'final') {
            you = `You: ${mine.correct}/${summary.gamesTotal}${ranked ? ` · ${rankLabel(ranked.rank, ranked.tied)}` : ''}`;
          } else {
            you = `You: ${mine.correct} so far${ranked ? ` · ${rankLabel(ranked.rank, ranked.tied)}` : ''}`;
          }
          const winners = state === 'final' ? summary.winners.map((w) => w.name) : [];
          return (
            <li key={week.id} className="border-b border-border last:border-b-0">
              <Link
                href={`${from}?week=${week.id}`}
                data-testid={`week-row-${week.weekNumber}`}
                aria-current={week.id === sel.week?.id ? 'true' : undefined}
                className={`flex min-h-[72px] flex-col justify-center gap-1 px-4 py-2.5 hover:bg-surface-2 ${
                  week.id === sel.week?.id ? 'bg-accent/10' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xl font-bold">Week {week.weekNumber}</span>
                  <WeekStatePill state={state} />
                  {won && (
                    <span className="rounded-full bg-correct/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#8ff0bc]">
                      You won
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted">
                  {you}
                  {winners.length > 0 && ` · Winner: ${winners.join(', ')}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-center text-sm text-muted">Next week unlocks Tuesday at 12:00 AM PT.</p>
    </div>
  );
}
