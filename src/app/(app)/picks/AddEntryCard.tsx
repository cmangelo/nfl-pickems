import Link from 'next/link';
import { Copy, Plus } from 'lucide-react';

/** Offers another entry for the week: blank, or starting from the entry shown. */
export default function AddEntryCard({
  newHref,
  copyHref,
  copyLabel,
  note = 'Playing more than once? Each entry is a separate entry fee and is paid for on its own.',
}: {
  newHref: string;
  copyHref: string | null;
  copyLabel: string;
  note?: string;
}) {
  return (
    <section data-testid="add-entry" aria-labelledby="add-entry-h" className="mt-6 rounded-xl border border-dashed border-border p-3">
      <h2 id="add-entry-h" className="text-sm font-semibold">Add another entry</h2>
      <p className="mt-1 text-xs text-muted">{note}</p>
      <div className="mt-3 flex gap-2">
        <Link
          href={newHref}
          data-testid="add-entry-blank"
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface-2 text-sm font-semibold"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          Start blank
        </Link>
        {copyHref && (
          <Link
            href={copyHref}
            data-testid="add-entry-copy"
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface-2 text-sm font-semibold"
          >
            <Copy size={16} strokeWidth={2.5} aria-hidden="true" />
            {copyLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
