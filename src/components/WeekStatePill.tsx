import type { WeekState } from '@/lib/weeks';

const STYLES: Record<'open' | 'live' | 'final', string> = {
  open: 'bg-accent/15 text-accent-bright',
  live: 'bg-[#3a1717] text-[#ff9c9c]',
  final: 'bg-surface-2 text-[#c9cdd4]',
};

/** Open (accent) / Live (red dot, locked and in progress) / Final (neutral). Hidden weeks render nothing. */
export default function WeekStatePill({ state, testId }: { state: WeekState; testId?: string }) {
  if (state === 'hidden') return null;
  const kind = state === 'open' ? 'open' : state === 'locked' ? 'live' : 'final';
  const label = kind === 'open' ? 'Open' : kind === 'live' ? 'Live' : 'Final';
  return (
    <span
      data-testid={testId}
      data-state={kind}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${STYLES[kind]}`}
    >
      {kind === 'live' && <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />}
      {label}
    </span>
  );
}
