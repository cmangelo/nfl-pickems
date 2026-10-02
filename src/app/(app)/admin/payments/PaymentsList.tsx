'use client';

import Link from 'next/link';
import { useState } from 'react';
import { setPaidAction } from '../actions';

export interface PaymentEntry {
  userId: number;
  firstName: string;
  username: string;
  submitted: string;
  paid: boolean;
  /** "Edited by admin Ann · Thu 3:10 PM PT" when an admin changed this entry. */
  edited: string | null;
}

export default function PaymentsList({ weekId, entries }: { weekId: number; entries: PaymentEntry[] }) {
  const [paid, setPaid] = useState<Record<number, boolean>>(() => Object.fromEntries(entries.map((e) => [e.userId, e.paid])));
  const [error, setError] = useState<string | null>(null);

  const toggle = async (userId: number) => {
    const next = !paid[userId];
    setError(null);
    setPaid((p) => ({ ...p, [userId]: next }));
    try {
      const res = await setPaidAction(userId, weekId, next);
      if (!res.ok) throw new Error(res.error);
    } catch {
      setPaid((p) => ({ ...p, [userId]: !next }));
      setError('Could not save. Please try again.');
    }
  };

  const nPaid = entries.filter((e) => paid[e.userId]).length;
  const nUnpaid = entries.length - nPaid;

  return (
    <>
      <p data-testid="paid-summary" className="text-lg font-bold">
        {nPaid} paid · {nUnpaid} unpaid
      </p>
      <p className="text-sm text-muted">
        Everyone starts unpaid. Only paid entries count in this week&apos;s results. Change anytime, even after the week ends.
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-wrong/15 px-3 py-2 text-sm text-[#ff9c9c]">
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-center text-muted">No picks submitted for this week yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {entries.map((e) => {
            const on = !!paid[e.userId];
            return (
              <li
                key={e.userId}
                data-testid={`entry-${e.username}`}
                className="flex min-h-[64px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {e.firstName} <span className="font-normal text-muted">@{e.username}</span>
                  </div>
                  <div className="text-xs text-muted">Submitted {e.submitted}</div>
                  {e.edited && (
                    <div data-testid={`edited-${e.username}`} className="text-xs text-muted">
                      {e.edited}
                    </div>
                  )}
                  <Link
                    href={`/admin/picks/${e.userId}?week=${weekId}`}
                    aria-label={`Edit picks for ${e.firstName}`}
                    className="text-xs font-semibold text-accent-bright"
                  >
                    Edit picks
                  </Link>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${e.firstName} paid`}
                  onClick={() => toggle(e.userId)}
                  className={`h-11 min-w-[88px] rounded-full border-[1.5px] px-4 text-sm font-bold ${
                    on ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-muted'
                  }`}
                >
                  {on ? 'Paid' : 'Unpaid'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
