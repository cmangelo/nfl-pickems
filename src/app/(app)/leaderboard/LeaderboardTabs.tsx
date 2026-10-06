import Link from 'next/link';

/** "This week | Season" switch at the top of the Leaderboard tab. Keeps the selected week in both links. */
export default function LeaderboardTabs({ active, weekId }: { active: 'week' | 'season'; weekId: number | null }) {
  const q = weekId ? `?week=${weekId}` : '';
  const tabs = [
    { id: 'week', label: 'This week', href: `/leaderboard${q}` },
    { id: 'season', label: 'Season', href: `/leaderboard/season${q}` },
  ] as const;
  return (
    <nav aria-label="Leaderboard view" data-testid="leaderboard-tabs" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            data-testid={`lb-tab-${t.id}`}
            className={`rounded-full py-1.5 text-center text-sm font-semibold transition-colors ${
              on ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
