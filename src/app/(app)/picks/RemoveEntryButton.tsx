'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/** Two-step "Remove this entry" (no browser dialog). `action` is a server action bound to the entry. */
export default function RemoveEntryButton({
  action,
  label,
  afterHref,
}: {
  action: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** "Entry 2" */
  label: string;
  afterHref: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.replace(afterHref);
        router.refresh();
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      {error && (
        <p role="alert" className="w-full rounded-lg bg-wrong/15 px-3 py-2 text-sm text-[#ff9c9c]">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-11 flex-1 rounded-[10px] border border-border bg-surface-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            data-testid="remove-entry-confirm"
            className="h-11 flex-1 rounded-[10px] border border-wrong bg-wrong/15 text-sm font-bold text-[#ff9c9c] disabled:opacity-60"
          >
            {pending ? 'Removing…' : `Yes, remove ${label}`}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          data-testid="remove-entry"
          className="text-sm font-semibold text-[#ff9c9c]"
        >
          Remove {label}
        </button>
      )}
    </div>
  );
}
