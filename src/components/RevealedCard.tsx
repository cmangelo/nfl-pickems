/** Open-week card for Leaderboard / Games: picks are hidden until the lock; shows "N in" (and optionally names). */
export default function RevealedCard({
  lockShort,
  names,
  count,
  viewerId,
}: {
  lockShort: string;
  /** Players with submitted entries (paid or not), and how many entries each. Omit `names` to show the count only. */
  names?: { userId: number; firstName: string; entries: number }[];
  /** Submitted entries (a player with two entries counts twice). */
  count: number;
  viewerId: number;
}) {
  return (
    <div data-testid="revealed-card" className="rounded-xl border border-border bg-surface p-4">
      <div data-testid="revealed-title" className="text-lg font-semibold">Picks revealed {lockShort}</div>
      <p className="mt-1 text-sm text-muted">
        Everyone&apos;s picks stay hidden until the week locks, so nobody can copy. You can change yours until then.
      </p>
      <div className="mt-4 flex items-baseline gap-2">
        <span data-testid="in-count" className="text-3xl font-bold text-accent-bright">{count} in</span>
        <span className="text-sm text-muted">so far</span>
      </div>
      {names && (
        count === 0 ? (
          <p data-testid="in-empty" className="mt-2 text-sm text-muted">Nobody has submitted yet.</p>
        ) : (
          <ul data-testid="in-list" className="mt-2 flex flex-wrap gap-2">
            {names.map((n) => (
              <li key={n.userId} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm">
                {n.firstName}
                {n.entries > 1 && <span className="font-semibold text-accent-bright"> ×{n.entries}</span>}
                {n.userId === viewerId && <span className="text-muted"> (you)</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
