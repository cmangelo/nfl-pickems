'use client';

import Link from 'next/link';
import { useState } from 'react';
import { computePot, potLine } from '@/lib/pot';
import { setPaidAction } from '../actions';

export interface PaymentEntry {
  entryId: number;
  /** 0-based position among the player's entries this week, and how many they have. */
  entryIndex: number;
  entryCount: number;
  /** "Ann", or "Ann (2)" when the player has several entries. */
  label: string;
  userId: number;
  firstName: string;
  username: string;
  submitted: string;
  paid: boolean;
  /** "Edited by admin Ann · Thu 3:10 PM PT" when an admin changed this entry. */
  edited: string | null;
}

/** One row per player; a player with several entries gets one paid switch per entry (each is a separate fee). */
export default function PaymentsList({
  weekId,
  entries,
  feeCents = null,
}: {
  weekId: number;
  entries: PaymentEntry[];
  /** Entry fee in effect for the week (null = none): shows the pot from the paid switches as they change. */
  feeCents?: number | null;
}) {
  const [paid, setPaid] = useState<Record<number, boolean>>(() => Object.fromEntries(entries.map((e) => [e.entryId, e.paid])));
  const [error, setError] = useState<string | null>(null);

  const toggle = async (entryId: number) => {
    const next = !paid[entryId];
    setError(null);
    setPaid((p) => ({ ...p, [entryId]: next }));
    try {
      const res = await setPaidAction(entryId, next);
      if (!res.ok) throw new Error(res.error);
    } catch {
      setPaid((p) => ({ ...p, [entryId]: !next }));
      setError('Could not save. Please try again.');
    }
  };

  const nPaid = entries.filter((e) => paid[e.entryId]).length;
  const nUnpaid = entries.length - nPaid;
  const pot = computePot(feeCents, nPaid);
  const players: PaymentEntry[][] = [];
  for (const e of entries) {
    const last = players[players.length - 1];
    if (last && last[0].userId === e.userId) last.push(e);
    else players.push([e]);
  }

  const paidSwitch = (e: PaymentEntry) => {
    const on = !!paid[e.entryId];
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${e.label} paid`}
        data-testid={`paid-${e.entryId}`}
        onClick={() => toggle(e.entryId)}
        className={`h-11 min-w-[88px] rounded-full border-[1.5px] px-4 text-sm font-bold ${
          on ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-muted'
        }`}
      >
        {on ? 'Paid' : 'Unpaid'}
      </button>
    );
  };
  const editLink = (e: PaymentEntry, text: string) => (
    <Link
      href={`/admin/picks/${e.userId}?week=${weekId}&entry=${e.entryId}`}
      aria-label={`Edit picks for ${e.label}`}
      className="text-xs font-semibold text-accent-bright"
    >
      {text}
    </Link>
  );
  const edited = (e: PaymentEntry, testId: string) =>
    e.edited && (
      <div data-testid={testId} className="text-xs text-muted">
        {e.edited}
      </div>
    );

  return (
    <>
      <p data-testid="paid-summary" className="text-lg font-bold">
        {nPaid} paid · {nUnpaid} unpaid
      </p>
      {pot && (
        <p data-testid="admin-pot" className="text-sm font-semibold text-accent-bright">
          {potLine(pot)}
        </p>
      )}
      <p className="text-sm text-muted">
        Everyone starts unpaid. Only paid entries count in this week&apos;s results. Change anytime, even after the week ends.
        A player with more than one entry pays for each one.
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
          {players.map((group) => {
            const e = group[0];
            const head = (
              <div className="truncate font-semibold">
                {e.firstName} <span className="font-normal text-muted">@{e.username}</span>
                {group.length > 1 && (
                  <span data-testid={`entry-count-${e.username}`} className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-accent-bright">
                    {group.length} entries
                  </span>
                )}
              </div>
            );
            if (group.length === 1) {
              return (
                <li
                  key={e.userId}
                  data-testid={`entry-${e.username}`}
                  className="flex min-h-[64px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    {head}
                    <div className="text-xs text-muted">Submitted {e.submitted}</div>
                    {edited(e, `edited-${e.username}`)}
                    {editLink(e, 'Edit picks')}
                  </div>
                  {paidSwitch(e)}
                </li>
              );
            }
            return (
              <li key={e.userId} data-testid={`entry-${e.username}`} className="border-b border-border px-3 py-2 last:border-b-0">
                {head}
                <ul className="mt-1">
                  {group.map((x) => (
                    <li
                      key={x.entryId}
                      data-testid={`entry-${x.username}-${x.entryIndex + 1}`}
                      className="flex min-h-[56px] items-center gap-3 border-t border-border/60 py-1.5 first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">Entry {x.entryIndex + 1}</div>
                        <div className="text-xs text-muted">Submitted {x.submitted}</div>
                        {edited(x, `edited-${x.username}-${x.entryIndex + 1}`)}
                        {editLink(x, 'Edit picks')}
                      </div>
                      {paidSwitch(x)}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
