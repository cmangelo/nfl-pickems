/** Pulsing red "Q3 · 4:12" status for a game in progress (label from `liveLabel`). */
export default function LiveBadge({ label, testId }: { label: string; testId: string }) {
  return (
    <span data-testid={testId} data-live="true" className="inline-flex items-center gap-1.5 font-bold text-[#ff9c9c]">
      <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-current" />
      <span className="sr-only">Live: </span>
      {label}
    </span>
  );
}
