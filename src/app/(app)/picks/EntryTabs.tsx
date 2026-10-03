import Link from 'next/link';

export interface EntryTab {
  key: string;
  label: string;
  href: string;
  current: boolean;
}

/** Switches between a player's entries for the week (shown only when they have several). */
export default function EntryTabs({ tabs }: { tabs: EntryTab[] }) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Entries" data-testid="entry-tabs" className="-mx-1 mb-3 overflow-x-auto px-1">
      <ul className="flex gap-2">
        {tabs.map((t) => (
          <li key={t.key} className="shrink-0">
            <Link
              href={t.href}
              aria-current={t.current ? 'page' : undefined}
              data-testid={`entry-tab-${t.key}`}
              className={`flex h-9 items-center rounded-full border-[1.5px] px-3.5 text-sm font-semibold ${
                t.current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-muted'
              }`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
